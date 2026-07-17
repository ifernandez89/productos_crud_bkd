import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Collection } from '@prisma/client';

export interface CreateCollectionData {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}

@Injectable()
export class CollectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCollectionData): Promise<Collection> {
    return this.prisma.collection.create({ data });
  }

  async findAll(): Promise<(Collection & { _count: { documents: number } })[]> {
    return this.prisma.collection.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { documents: true } } },
    }) as any;
  }

  async findById(id: number) {
    return this.prisma.collection.findUnique({
      where: { id },
      include: {
        documents: {
          include: {
            document: {
              select: {
                id: true,
                title: true,
                category: true,
                timesUsed: true,
                lastUsed: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
          orderBy: { addedAt: 'desc' },
        },
      },
    });
  }

  async addDocument(collectionId: number, documentId: number) {
    return this.prisma.collectionDocument.upsert({
      where: { collectionId_documentId: { collectionId, documentId } },
      create: { collectionId, documentId },
      update: {},
    });
  }

  async removeDocument(collectionId: number, documentId: number) {
    return this.prisma.collectionDocument.delete({
      where: { collectionId_documentId: { collectionId, documentId } },
    });
  }

  async update(
    id: number,
    data: Partial<CreateCollectionData>,
  ): Promise<Collection> {
    return this.prisma.collection.update({ where: { id }, data });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.collection.delete({ where: { id } });
  }

  async getDocumentCollections(documentId: number) {
    return this.prisma.collectionDocument.findMany({
      where: { documentId },
      include: { collection: true },
    });
  }
}
