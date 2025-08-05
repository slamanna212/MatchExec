"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchExecScheduler = void 0;
var database_1 = require("../../lib/database");
var cron = require("node-cron");
var MatchExecScheduler = /** @class */ (function () {
    function MatchExecScheduler() {
        this.isRunning = false;
        this.cronJobs = [];
    }
    MatchExecScheduler.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log('🕐 Starting MatchExec Scheduler...');
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, , 5]);
                        // Initialize database
                        _a = this;
                        return [4 /*yield*/, (0, database_1.initializeDatabase)()];
                    case 2:
                        // Initialize database
                        _a.db = _b.sent();
                        console.log('✅ Database initialized');
                        this.isRunning = true;
                        // Load and start cron jobs
                        return [4 /*yield*/, this.loadSchedulerSettings()];
                    case 3:
                        // Load and start cron jobs
                        _b.sent();
                        console.log('✅ Scheduler started successfully');
                        this.keepAlive();
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _b.sent();
                        console.error('❌ Failed to start scheduler:', error_1);
                        process.exit(1);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecScheduler.prototype.loadSchedulerSettings = function () {
        return __awaiter(this, void 0, void 0, function () {
            var settings, defaultSettings, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.db.get('SELECT * FROM scheduler_settings WHERE id = 1')];
                    case 1:
                        settings = _a.sent();
                        if (!settings) {
                            console.log('⚠️ No scheduler settings found, using defaults');
                            defaultSettings = {
                                match_check_cron: '0 */5 * * * *',
                                reminder_check_cron: '0 0 */4 * * *',
                                cleanup_check_cron: '0 0 2 * * *',
                                report_generation_cron: '0 0 0 * * 0'
                            };
                            this.startCronJob('Match Check', defaultSettings.match_check_cron, this.checkMatchStartTimes.bind(this));
                            this.startCronJob('Reminder Check', defaultSettings.reminder_check_cron, this.sendParticipantReminders.bind(this));
                            this.startCronJob('Data Cleanup', defaultSettings.cleanup_check_cron, this.cleanupOldMatches.bind(this));
                            this.startCronJob('Report Generation', defaultSettings.report_generation_cron, this.generateReports.bind(this));
                            console.log("\u2705 Loaded ".concat(this.cronJobs.length, " scheduled tasks with default settings"));
                            return [2 /*return*/];
                        }
                        // Stop existing cron jobs
                        this.cronJobs.forEach(function (job) { return job.stop(); });
                        this.cronJobs = [];
                        // Start new cron jobs based on settings
                        this.startCronJob('Match Check', settings.match_check_cron, this.checkMatchStartTimes.bind(this));
                        this.startCronJob('Reminder Check', settings.reminder_check_cron, this.sendParticipantReminders.bind(this));
                        this.startCronJob('Data Cleanup', settings.cleanup_check_cron, this.cleanupOldMatches.bind(this));
                        this.startCronJob('Report Generation', settings.report_generation_cron, this.generateReports.bind(this));
                        console.log("\u2705 Loaded ".concat(this.cronJobs.length, " scheduled tasks"));
                        return [3 /*break*/, 3];
                    case 2:
                        error_2 = _a.sent();
                        console.error('❌ Failed to load scheduler settings:', error_2);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecScheduler.prototype.startCronJob = function (name, cronExpression, task) {
        var _this = this;
        try {
            if (cron.validate(cronExpression)) {
                var job = cron.schedule(cronExpression, function () { return __awaiter(_this, void 0, void 0, function () {
                    var error_3;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                console.log("\uD83D\uDD04 Running ".concat(name, "..."));
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, task()];
                            case 2:
                                _a.sent();
                                console.log("\u2705 ".concat(name, " completed"));
                                return [3 /*break*/, 4];
                            case 3:
                                error_3 = _a.sent();
                                console.error("\u274C ".concat(name, " failed:"), error_3);
                                return [3 /*break*/, 4];
                            case 4: return [2 /*return*/];
                        }
                    });
                }); }, {
                    timezone: 'UTC'
                });
                this.cronJobs.push(job);
                console.log("\uD83D\uDCC5 Scheduled ".concat(name, ": ").concat(cronExpression));
            }
            else {
                console.error("\u274C Invalid cron expression for ".concat(name, ": ").concat(cronExpression));
            }
        }
        catch (error) {
            console.error("\u274C Failed to schedule ".concat(name, ":"), error);
        }
    };
    MatchExecScheduler.prototype.checkMatchStartTimes = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, matches, _i, matches_1, match;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        now = new Date();
                        return [4 /*yield*/, this.db.all("SELECT * FROM matches \n       WHERE status = 'registration' \n       AND start_date <= ? \n       AND start_date IS NOT NULL", [now.toISOString()])];
                    case 1:
                        matches = _a.sent();
                        _i = 0, matches_1 = matches;
                        _a.label = 2;
                    case 2:
                        if (!(_i < matches_1.length)) return [3 /*break*/, 5];
                        match = matches_1[_i];
                        console.log("\uD83C\uDFC6 Starting match: ".concat(match.name));
                        return [4 /*yield*/, this.db.run('UPDATE matches SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['ongoing', match.id])];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    MatchExecScheduler.prototype.sendParticipantReminders = function () {
        return __awaiter(this, void 0, void 0, function () {
            var tomorrow, upcomingMatches, _i, upcomingMatches_1, match;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        return [4 /*yield*/, this.db.all("SELECT m.*, COUNT(mp.id) as participant_count\n       FROM matches m\n       LEFT JOIN match_participants mp ON m.id = mp.match_id\n       WHERE m.start_date BETWEEN datetime('now') AND datetime('now', '+24 hours')\n       AND m.status = 'registration'\n       GROUP BY m.id")];
                    case 1:
                        upcomingMatches = _a.sent();
                        for (_i = 0, upcomingMatches_1 = upcomingMatches; _i < upcomingMatches_1.length; _i++) {
                            match = upcomingMatches_1[_i];
                            console.log("\uD83D\uDCE2 Sending reminders for match: ".concat(match.name, " (").concat(match.participant_count, " participants)"));
                            // TODO: Implement Discord notification logic
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    MatchExecScheduler.prototype.cleanupOldMatches = function () {
        return __awaiter(this, void 0, void 0, function () {
            var thirtyDaysAgo, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        return [4 /*yield*/, this.db.run("DELETE FROM matches \n       WHERE status = 'completed' \n       AND updated_at < ?", [thirtyDaysAgo.toISOString()])];
                    case 1:
                        result = _a.sent();
                        if (result.changes > 0) {
                            console.log("\uD83D\uDDD1\uFE0F Cleaned up ".concat(result.changes, " old matches"));
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    MatchExecScheduler.prototype.generateReports = function () {
        return __awaiter(this, void 0, void 0, function () {
            var weekAgo, stats;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        return [4 /*yield*/, this.db.get("SELECT \n         COUNT(*) as total_matches,\n         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_matches,\n         COUNT(CASE WHEN status = 'ongoing' THEN 1 END) as ongoing_matches,\n         COUNT(CASE WHEN status = 'registration' THEN 1 END) as registration_matches\n       FROM matches \n       WHERE created_at >= ?", [weekAgo.toISOString()])];
                    case 1:
                        stats = _a.sent();
                        console.log("\uD83D\uDCCA Weekly Report: ".concat(stats.total_matches, " total, ").concat(stats.completed_matches, " completed, ").concat(stats.ongoing_matches, " ongoing, ").concat(stats.registration_matches, " in registration"));
                        return [2 /*return*/];
                }
            });
        });
    };
    MatchExecScheduler.prototype.keepAlive = function () {
        var _this = this;
        // Keep the process alive
        setInterval(function () {
            if (_this.isRunning) {
                console.log('🕐 Scheduler heartbeat');
            }
        }, 300000); // Every 5 minutes
    };
    MatchExecScheduler.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                console.log('🛑 Stopping scheduler...');
                this.isRunning = false;
                // Stop all cron jobs
                this.cronJobs.forEach(function (job) { return job.stop(); });
                this.cronJobs = [];
                return [2 /*return*/];
            });
        });
    };
    MatchExecScheduler.prototype.reloadSettings = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('🔄 Reloading scheduler settings...');
                        return [4 /*yield*/, this.loadSchedulerSettings()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return MatchExecScheduler;
}());
exports.MatchExecScheduler = MatchExecScheduler;
// Create and start the scheduler
var scheduler = new MatchExecScheduler();
// Handle process signals
process.on('SIGINT', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('🛑 Received SIGINT, shutting down gracefully...');
                return [4 /*yield*/, scheduler.stop()];
            case 1:
                _a.sent();
                process.exit(0);
                return [2 /*return*/];
        }
    });
}); });
process.on('SIGTERM', function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log('🛑 Received SIGTERM, shutting down gracefully...');
                return [4 /*yield*/, scheduler.stop()];
            case 1:
                _a.sent();
                process.exit(0);
                return [2 /*return*/];
        }
    });
}); });
// Start the scheduler
scheduler.start().catch(console.error);
