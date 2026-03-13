import { prisma } from './index.js'

async function seed() {
  console.log('🌱 Seeding database...')

  // Seed demo user
  const user = await prisma.user.upsert({
    where: { email: 'demo@jobflow.ai' },
    update: {},
    create: {
      email: 'demo@jobflow.ai',
      name: 'Demo User',
      role: 'user',
      plan: 'pro',
      skills: {
        create: [
          { name: 'TypeScript', category: 'programming', proficiency: 'advanced' },
          { name: 'React', category: 'framework', proficiency: 'advanced' },
          { name: 'Node.js', category: 'framework', proficiency: 'intermediate' },
          { name: 'PostgreSQL', category: 'tool', proficiency: 'intermediate' },
          { name: 'Docker', category: 'tool', proficiency: 'beginner' },
          { name: 'Problem Solving', category: 'soft', proficiency: 'expert' },
        ],
      },
    },
  })

  console.log(`✅ Created demo user: ${user.email}`)

  // Seed sample jobs
  const jobs = await Promise.all([
    prisma.job.upsert({
      where: { source_externalId: { source: 'manual', externalId: 'sample-1' } },
      update: {},
      create: {
        externalId: 'sample-1',
        source: 'manual',
        title: 'Senior Frontend Engineer',
        company: 'Tokopedia',
        location: 'Jakarta, Indonesia',
        salaryMin: 20000000,
        salaryMax: 35000000,
        currency: 'IDR',
        isRemote: false,
        jobType: 'hybrid',
        description:
          'We are looking for a Senior Frontend Engineer to join our team. You will be responsible for building and maintaining our web applications using React and TypeScript.',
        requirements: '3+ years of experience with React, TypeScript, and modern web technologies.',
        applyUrl: 'https://careers.tokopedia.com',
        industry: 'E-Commerce',
        companySize: '1000+',
      },
    }),
    prisma.job.upsert({
      where: { source_externalId: { source: 'manual', externalId: 'sample-2' } },
      update: {},
      create: {
        externalId: 'sample-2',
        source: 'manual',
        title: 'Backend Engineer - Node.js',
        company: 'Gojek',
        location: 'Jakarta, Indonesia',
        salaryMin: 18000000,
        salaryMax: 30000000,
        currency: 'IDR',
        isRemote: true,
        jobType: 'remote',
        description:
          'Join our backend engineering team to build scalable microservices that power millions of users across Southeast Asia.',
        requirements: '2+ years of Node.js experience, familiarity with microservices architecture.',
        applyUrl: 'https://careers.gojek.com',
        industry: 'Technology',
        companySize: '5000+',
      },
    }),
  ])

  console.log(`✅ Created ${jobs.length} sample jobs`)

  console.log('🎉 Seeding complete!')
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
