import { initializeDatabase } from '../../lib/database';
import * as cron from 'node-cron';
import { SchedulerSettings } from '../../shared/types';

class MatchExecScheduler {
  private isRunning = false;
  private db: any;
  private cronJobs: cron.ScheduledTask[] = [];

  async start() {
    console.log('🕐 Starting MatchExec Scheduler...');
    
    try {
      // Initialize database
      this.db = await initializeDatabase();
      console.log('✅ Database initialized');
      
      this.isRunning = true;
      
      // Load and start cron jobs
      await this.loadSchedulerSettings();
      
      console.log('✅ Scheduler started successfully');
      
      this.keepAlive();
      
    } catch (error) {
      console.error('❌ Failed to start scheduler:', error);
      process.exit(1);
    }
  }

  private async loadSchedulerSettings() {
    try {
      const settings = await this.db.get(
        'SELECT * FROM scheduler_settings WHERE id = 1'
      ) as SchedulerSettings;

      if (!settings || !settings.enabled) {
        console.log('⏸️ Scheduler is disabled');
        return;
      }

      // Stop existing cron jobs
      this.cronJobs.forEach(job => job.stop());
      this.cronJobs = [];

      // Start new cron jobs based on settings
      this.startCronJob('Tournament Check', settings.tournament_check_cron, this.checkTournamentStartTimes.bind(this));
      this.startCronJob('Reminder Check', settings.reminder_check_cron, this.sendParticipantReminders.bind(this));
      this.startCronJob('Data Cleanup', settings.cleanup_check_cron, this.cleanupOldTournaments.bind(this));
      this.startCronJob('Report Generation', settings.report_generation_cron, this.generateReports.bind(this));

      console.log(`✅ Loaded ${this.cronJobs.length} scheduled tasks`);
    } catch (error) {
      console.error('❌ Failed to load scheduler settings:', error);
    }
  }

  private startCronJob(name: string, cronExpression: string, task: () => Promise<void>) {
    try {
      if (cron.validate(cronExpression)) {
        const job = cron.schedule(cronExpression, async () => {
          console.log(`🔄 Running ${name}...`);
          try {
            await task();
            console.log(`✅ ${name} completed`);
          } catch (error) {
            console.error(`❌ ${name} failed:`, error);
          }
        }, {
          timezone: 'UTC'
        });
        
        this.cronJobs.push(job);
        console.log(`📅 Scheduled ${name}: ${cronExpression}`);
      } else {
        console.error(`❌ Invalid cron expression for ${name}: ${cronExpression}`);
      }
    } catch (error) {
      console.error(`❌ Failed to schedule ${name}:`, error);
    }
  }

  private async checkTournamentStartTimes() {
    // Check for tournaments that should start
    const now = new Date();
    const tournaments = await this.db.all(
      `SELECT * FROM tournaments 
       WHERE status = 'registration' 
       AND start_date <= ? 
       AND start_date IS NOT NULL`,
      [now.toISOString()]
    );

    for (const tournament of tournaments) {
      console.log(`🏆 Starting tournament: ${tournament.name}`);
      await this.db.run(
        'UPDATE tournaments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['ongoing', tournament.id]
      );
    }
  }

  private async sendParticipantReminders() {
    // Send reminders for upcoming tournaments
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const upcomingTournaments = await this.db.all(
      `SELECT t.*, COUNT(tp.id) as participant_count
       FROM tournaments t
       LEFT JOIN tournament_participants tp ON t.id = tp.tournament_id
       WHERE t.start_date BETWEEN datetime('now') AND datetime('now', '+24 hours')
       AND t.status = 'registration'
       GROUP BY t.id`
    );

    for (const tournament of upcomingTournaments) {
      console.log(`📢 Sending reminders for tournament: ${tournament.name} (${tournament.participant_count} participants)`);
      // TODO: Implement Discord notification logic
    }
  }

  private async cleanupOldTournaments() {
    // Clean up tournaments completed more than 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.db.run(
      `DELETE FROM tournaments 
       WHERE status = 'completed' 
       AND updated_at < ?`,
      [thirtyDaysAgo.toISOString()]
    );

    if (result.changes > 0) {
      console.log(`🗑️ Cleaned up ${result.changes} old tournaments`);
    }
  }

  private async generateReports() {
    // Generate weekly tournament reports
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const stats = await this.db.get(
      `SELECT 
         COUNT(*) as total_tournaments,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tournaments,
         COUNT(CASE WHEN status = 'ongoing' THEN 1 END) as ongoing_tournaments,
         COUNT(CASE WHEN status = 'registration' THEN 1 END) as registration_tournaments
       FROM tournaments 
       WHERE created_at >= ?`,
      [weekAgo.toISOString()]
    );

    console.log(`📊 Weekly Report: ${stats.total_tournaments} total, ${stats.completed_tournaments} completed, ${stats.ongoing_tournaments} ongoing, ${stats.registration_tournaments} in registration`);
    // TODO: Store or send report somewhere
  }

  private keepAlive() {
    // Keep the process alive
    setInterval(() => {
      if (this.isRunning) {
        console.log('🕐 Scheduler heartbeat');
      }
    }, 300000); // Every 5 minutes
  }

  async stop() {
    console.log('🛑 Stopping scheduler...');
    this.isRunning = false;
    
    // Stop all cron jobs
    this.cronJobs.forEach(job => job.stop());
    this.cronJobs = [];
  }

  async reloadSettings() {
    console.log('🔄 Reloading scheduler settings...');
    await this.loadSchedulerSettings();
  }
}

// Create and start the scheduler
const scheduler = new MatchExecScheduler();

// Handle process signals
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  await scheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  await scheduler.stop();
  process.exit(0);
});

// Start the scheduler
scheduler.start().catch(console.error);

export { MatchExecScheduler };