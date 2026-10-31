import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserProfile } from '@prisma/client';

export interface UserPreferences {
  location?: string;
  city?: string;
  department?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  [key: string]: any;
}

export interface UpdateProfileData {
  name?: string;
  timezone?: string;
  country?: string;
  language?: string;
  preferences?: string | UserPreferences;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  location: 'Tala, Departamento Paraná, Entre Ríos, 3118, Argentina',
  city: 'Tala',
  department: 'Departamento Paraná',
  state: 'Entre Ríos',
  postalCode: '3118',
  country: 'Argentina',
};

@Injectable()
export class UserProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(): Promise<UserProfile> {
    const existing = await this.prisma.userProfile.findFirst();
    if (existing) {
      const updates: Partial<{ name: string; preferences: string }> = {};
      if (!existing.name) {
        updates.name = 'Ignacio Fernández (@ifernandez89)';
      }
      if (!existing.preferences) {
        updates.preferences = JSON.stringify(DEFAULT_PREFERENCES);
      }
      if (Object.keys(updates).length > 0) {
        return this.prisma.userProfile.update({
          where: { id: existing.id },
          data: updates,
        });
      }
      return existing;
    }

    return this.prisma.userProfile.create({
      data: {
        name: 'Ignacio Fernández (@ifernandez89)',
        timezone: 'America/Argentina/Buenos_Aires',
        country: 'Argentina',
        language: 'es-AR',
        preferences: JSON.stringify(DEFAULT_PREFERENCES),
      },
    });
  }

  async update(id: number, data: UpdateProfileData): Promise<UserProfile> {
    const preferencesPayload =
      typeof data.preferences === 'object'
        ? JSON.stringify(data.preferences)
        : data.preferences;

    return this.prisma.userProfile.update({
      where: { id },
      data: {
        ...data,
        preferences: preferencesPayload,
        updatedAt: new Date(),
      },
    });
  }

  async get(): Promise<UserProfile | null> {
    return this.prisma.userProfile.findFirst();
  }
}
