import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type User = {
  id?: string;
  address: string;
  username?: string;
  avatar_url?: string;
  nonce?: string | null;
  nonce_expires_at?: number | string | null;
  balance?: number;
  collateral_value?: number;
  borrowed_value?: number;
};

@Injectable()
export class UsersService {
  constructor(private supabaseService: SupabaseService) {}

  async findOne(address: string): Promise<User | undefined> {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('address', address)
      .single();

    if (error || !data) {
      return undefined;
    }
    return data;
  }

  async createOrUpdate(address: string, user: Partial<User>): Promise<User> {
    const client = this.supabaseService.getClient();
    
    // Check if user exists
    const existing = await this.findOne(address);

    if (existing) {
      // Update
      const { data, error } = await client
        .from('users')
        .update(user)
        .eq('address', address)
        .select()
        .single();
        
      if (error) throw new Error(error.message);
      return data;
    } else {
      // Create
      const newUser = { 
        address, 
        ...user,
        balance: 12500.50, // Default mock balance
        collateral_value: 8000.00,
        borrowed_value: 1000.00
      };
      
      const { data, error } = await client
        .from('users')
        .insert(newUser)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    }
  }

  async updateProfile(address: string, username: string, avatarUrl: string) {
      return this.createOrUpdate(address, { username, avatar_url: avatarUrl });
  }
}
