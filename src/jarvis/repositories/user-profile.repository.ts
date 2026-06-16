import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserProfile } from '@prisma/client';

export interface UpdateProfileData {
  name?: string;
  timezone?: string;
  country?: string;
  language?: string;
  preferences?: Record<string, any>;
}

@Injectable()
export class UserProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(): Promise<UserProfile> {
    const existing = await this.prisma.userProfile.findFirst();
    if (existing) return existing;

    return this.prisma.userProfile.create({
      data: {
        timezone: 'America/Argentina/Buenos_Aires',
        country: 'Argentina',
        language: 'es-AR',
      },
    });
  }

  async update(id: number, data: UpdateProfileData): Promise<UserProfile> {
    return this.prisma.userProfile.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async get(): Promise<UserProfile | null> {
    return this.prisma.userProfile.findFirst();
  }
}
