import fs from 'fs';
import path from 'path';

export interface ReminderMessage {
  title: string;
  message: string;
}

export interface ReminderMessages {
  breakfast: ReminderMessage[];
  lunch: ReminderMessage[];
  dinner: ReminderMessage[];
}

export class ReminderMessageService {
  private messages: ReminderMessages | null = null;
  private messagesPath: string;

  constructor() {
    this.messagesPath = path.join(__dirname, '../data/reminderMessages.json');
  }

  private loadMessages(): ReminderMessages {
    if (this.messages) {
      return this.messages;
    }

    try {
      const fileContent = fs.readFileSync(this.messagesPath, 'utf8');
      this.messages = JSON.parse(fileContent);
      return this.messages!;
    } catch (error) {
      console.error('Error loading reminder messages:', error);
      // Fallback to default messages
      return this.getDefaultMessages();
    }
  }

  private getDefaultMessages(): ReminderMessages {
    return {
      breakfast: [
        { title: 'Time to log your meal', message: 'What did you have for breakfast?' }
      ],
      lunch: [
        { title: 'Time to log your meal', message: 'Log your lunch!' }
      ],
      dinner: [
        { title: 'Time to log your meal', message: 'Log your dinner!' }
      ]
    };
  }

  public getRandomMessage(mealType: 'breakfast' | 'lunch' | 'dinner'): ReminderMessage {
    const messages = this.loadMessages();
    const mealMessages = messages[mealType];
    
    if (!mealMessages || mealMessages.length === 0) {
      return this.getDefaultMessages()[mealType][0];
    }

    const randomIndex = Math.floor(Math.random() * mealMessages.length);
    return mealMessages[randomIndex];
  }
}

// Export a singleton instance
export const reminderMessageService = new ReminderMessageService();
