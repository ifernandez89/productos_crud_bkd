const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function check() {
  const baseDir = 'I:\\Musica\\Audiolibros y mas';
  let audioFiles = [];
  if (fs.existsSync(baseDir)) {
    audioFiles = fs.readdirSync(baseDir).filter(f => {
      const full = path.join(baseDir, f);
      return !f.startsWith('_') && fs.statSync(full).isFile();
    });
  }

  const docs = await prisma.document.findMany({
    select: { id: true, title: true, source: true, status: true },
  });

  const transDir = path.join(baseDir, '_transcripciones');
  const transFiles = fs.existsSync(transDir)
    ? fs.readdirSync(transDir).filter(f => f.endsWith('.json'))
    : [];

  const pendingAudio = audioFiles.filter(f => {
    return !docs.some(d => d.source && d.source.includes(f));
  });

  // Check docs/books or other folders
  const booksDir = path.resolve(__dirname, '../docs/books');
  let booksFiles = [];
  if (fs.existsSync(booksDir)) {
    booksFiles = fs.readdirSync(booksDir).filter(f => !fs.statSync(path.join(booksDir, f)).isDirectory());
  }
  const pendingBooks = booksFiles.filter(f => {
    return !docs.some(d => d.source && d.source.includes(f));
  });

  console.log(JSON.stringify({
    audiobooks: {
      total: audioFiles.length,
      ingested: audioFiles.length - pendingAudio.length,
      transcribedOnDisk: transFiles.length,
      pendingCount: pendingAudio.length,
      pendingList: pendingAudio
    },
    books: {
      total: booksFiles.length,
      pendingCount: pendingBooks.length,
      pendingList: pendingBooks
    }
  }, null, 2));

  await prisma.$disconnect();
}

check().catch(console.error);
