// Test the match creation API directly to see what's happening

async function testMatchCreation() {
  console.log('🧪 Testing match creation API...');
  
  const testMatchData = {
    name: "Test Match - Reminders",
    description: "Testing reminder creation",
    gameId: "valorant",
    startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
    livestreamLink: "",
    rules: "casual",
    rounds: 1,
    maps: [],
    eventImageUrl: null,
    playerNotifications: true,
    announcementVoiceChannel: null,
    announcements: [
      {
        id: "test1",
        value: 30,
        unit: "minutes"
      },
      {
        id: "test2", 
        value: 2,
        unit: "hours"
      },
      {
        id: "test3",
        value: 1,
        unit: "days"
      }
    ]
  };
  
  console.log('📤 Sending match data:');
  console.log('  Start date:', testMatchData.startDate);
  console.log('  Announcements:', testMatchData.announcements);
  
  try {
    const response = await fetch('http://localhost:3000/api/matches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testMatchData)
    });
    
    if (!response.ok) {
      console.error('❌ API Error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return;
    }
    
    const result = await response.json();
    console.log('✅ Match created successfully:');
    console.log('  Match ID:', result.id);
    console.log('  Match name:', result.name);
    
    // Now test the reminders API
    console.log('\n🔍 Checking reminders for the new match...');
    
    const remindersResponse = await fetch(`http://localhost:3000/api/matches/${result.id}/reminders`);
    
    if (!remindersResponse.ok) {
      console.error('❌ Reminders API Error:', remindersResponse.status);
      return;
    }
    
    const remindersResult = await remindersResponse.json();
    console.log('📅 Reminders result:');
    console.log('  Future reminders count:', remindersResult.reminderCount || 0);
    console.log('  Future reminders:', remindersResult.futureReminders || []);
    
    if (remindersResult.futureReminders && remindersResult.futureReminders.length > 0) {
      console.log('\n✅ SUCCESS: Found future reminders!');
      remindersResult.futureReminders.forEach((reminder, index) => {
        console.log(`  ${index + 1}. ${reminder.description} at ${reminder.reminder_time}`);
      });
    } else {
      console.log('\n❌ FAILED: No future reminders found');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testMatchCreation();
