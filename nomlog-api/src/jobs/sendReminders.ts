import 'dotenv/config';
import { ReminderService } from '../services/reminderService';

async function main() {
  try {
    const windowMinutes = process.env.REMINDER_WINDOW_MINUTES
      ? parseInt(process.env.REMINDER_WINDOW_MINUTES, 10)
      : 7;
    const service = new ReminderService(windowMinutes);
    const result = await service.run();
    console.log(JSON.stringify({ ok: true, ...result }));
    process.exit(0);
  } catch (error) {
    console.error('Reminder job failed:', error);
    process.exit(1);
  }
}

main();


