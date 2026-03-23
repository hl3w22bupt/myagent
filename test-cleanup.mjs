import { soulCleanupService } from './src/core/cleanup/soul-cleanup-service.ts';

async function testCleanup() {
  console.log('🧪 Testing cleanup service...\n');
  console.log('Current time:', new Date().toISOString());
  console.log('Cleanup duration: 1 hour (from SOUL_CLEANUP_DURATION_HOURS)\n');

  try {
    const result = await soulCleanupService.cleanupStoppedInstances();

    console.log('\n✅ Cleanup completed!');
    console.log('Deleted:', result.deletedCount, 'instances');
    console.log('Duration:', result.duration, 'ms');
    console.log('Session IDs:', result.sessionIds.join(', '));
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error);
  }
}

testCleanup();
