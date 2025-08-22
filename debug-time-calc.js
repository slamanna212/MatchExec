// Debug the time calculations
const startDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
const now = new Date();

console.log('Current time:', now.toISOString());
console.log('Match start time:', startDate.toISOString());

const announcements = [
  { id: "test1", value: 30, unit: "minutes" },
  { id: "test2", value: 2, unit: "hours" },
  { id: "test3", value: 1, unit: "days" }
];

announcements.forEach(announcement => {
  let reminderTime;
  const value = announcement.value || 1;
  
  switch (announcement.unit) {
    case 'minutes':
      reminderTime = new Date(startDate.getTime() - (value * 60 * 1000));
      break;
    case 'hours':
      reminderTime = new Date(startDate.getTime() - (value * 60 * 60 * 1000));
      break;
    case 'days':
      reminderTime = new Date(startDate.getTime() - (value * 24 * 60 * 60 * 1000));
      break;
  }
  
  const isFuture = reminderTime > now;
  
  console.log(`\n${announcement.value} ${announcement.unit} before:`);
  console.log(`  Reminder time: ${reminderTime.toISOString()}`);
  console.log(`  Is in future: ${isFuture}`);
  console.log(`  Would create: ${isFuture ? 'YES' : 'NO'}`);
});
