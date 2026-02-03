const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2] || '2026-02-03_tiktok_fandoms.json', 'utf8'));

console.log('Total records:', data.length);
console.log('Sample keys:', Object.keys(data[0] || {}).slice(0, 15).join(', '));
console.log('---');

// Group by search query
const bySearch = {};
data.forEach(d => {
  const q = d.searchQuery || d.hashtag?.name || d.musicMeta?.musicName || 'unknown';
  if (bySearch[q] === undefined) bySearch[q] = [];
  bySearch[q].push(d);
});

for (const [q, items] of Object.entries(bySearch)) {
  const totalViews = items.reduce((s, i) => s + (i.playCount || i.views || 0), 0);
  const totalLikes = items.reduce((s, i) => s + (i.diggCount || i.likes || 0), 0);
  const totalComments = items.reduce((s, i) => s + (i.commentCount || i.comments || 0), 0);
  const totalShares = items.reduce((s, i) => s + (i.shareCount || i.shares || 0), 0);
  const avgEngagement = items.length > 0 ? ((totalLikes + totalComments + totalShares) / items.length) : 0;

  console.log(`${q}:`);
  console.log(`  Posts: ${items.length}`);
  console.log(`  Views: ${totalViews.toLocaleString()}`);
  console.log(`  Likes: ${totalLikes.toLocaleString()}`);
  console.log(`  Comments: ${totalComments.toLocaleString()}`);
  console.log(`  Shares: ${totalShares.toLocaleString()}`);
  console.log(`  Avg Engagement/Post: ${Math.round(avgEngagement).toLocaleString()}`);
  console.log('');
}
