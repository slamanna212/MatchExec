import fs from 'fs';
import path from 'path';

export interface SignupField {
  id: string;
  type: 'text' | 'largetext';
  label: string;
  placeholder?: string;
  required: boolean;
  helpText?: string;
}

export interface SignupForm {
  fields: SignupField[];
  submitButton: {
    text: string;
    loadingText: string;
  };
}

export class SignupFormLoader {
  private static cache = new Map<string, SignupForm>();
  
  static async loadSignupForm(gameId: string): Promise<SignupForm | null> {
    // Check cache first
    if (this.cache.has(gameId)) {
      return this.cache.get(gameId)!;
    }

    try {
      const signupPath = path.join(process.cwd(), 'data', 'games', gameId, 'signup.json');
      
      if (!fs.existsSync(signupPath)) {
        console.warn(`⚠️ No signup form found for game: ${gameId}`);
        return this.getDefaultSignupForm();
      }

      const signupData = JSON.parse(fs.readFileSync(signupPath, 'utf-8'));
      
      // Validate the signup form structure
      if (!this.isValidSignupForm(signupData)) {
        console.error(`❌ Invalid signup form structure for game: ${gameId}`);
        return this.getDefaultSignupForm();
      }

      // Cache the form
      this.cache.set(gameId, signupData);
      console.log(`✅ Loaded signup form for game: ${gameId}`);
      return signupData;

    } catch (error) {
      console.error(`❌ Error loading signup form for ${gameId}:`, error);
      return this.getDefaultSignupForm();
    }
  }

  private static isValidSignupForm(data: unknown): data is SignupForm {
    if (!data || typeof data !== 'object') return false;
    
    const obj = data as Record<string, unknown>;
    
    return !!(
      Array.isArray(obj.fields) &&
      obj.fields.every((field: unknown) => {
        if (!field || typeof field !== 'object') return false;
        const f = field as Record<string, unknown>;
        return !!(
          f.id && 
          f.type && 
          ['text', 'largetext'].includes(f.type as string) &&
          f.label &&
          typeof f.required === 'boolean'
        );
      }) &&
      obj.submitButton &&
      typeof obj.submitButton === 'object' &&
      obj.submitButton !== null &&
      (obj.submitButton as Record<string, unknown>).text
    );
  }

  private static getDefaultSignupForm(): SignupForm {
    return {
      fields: [
        {
          id: 'username',
          type: 'text',
          label: 'In-game Username',
          placeholder: 'Enter your in-game username',
          required: true
        },
        {
          id: 'notes',
          type: 'largetext',
          label: 'Additional Notes (Optional)',
          placeholder: 'Any additional information or preferences',
          required: false
        }
      ],
      submitButton: {
        text: 'Sign Up',
        loadingText: 'Joining...'
      }
    };
  }

  static clearCache(gameId?: string) {
    if (gameId) {
      this.cache.delete(gameId);
    } else {
      this.cache.clear();
    }
  }
}