const fs = require('fs');
const { execSync } = require('child_process');

const API_BASE = 'https://www.moltbook.com/api/v1';
const API_KEY = process.env.MOLTBOOK_API_KEY; 
const REGISTRY_FILE = 'registry.json';

if (!API_KEY) {
    console.error("Error: MOLTBOOK_API_KEY environment variable not set.");
    process.exit(1);
}

// Load existing registry
let registry = {};
if (fs.existsSync(REGISTRY_FILE)) {
  registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
}

function curl(endpoint) {
  try {
    const cmd = `curl -s "${API_BASE}${endpoint}" -H "Authorization: Bearer ${API_KEY}"`;
    const res = execSync(cmd).toString();
    try {
        return JSON.parse(res);
    } catch (e) {
        return null;
    }
  } catch (e) {
    console.error(`Error fetching ${endpoint}:`, e.message);
    return null;
  }
}

console.log('🦞 Starting Harvest...');

// 1. Scan Global Feed for New Agents (Discovery)
const feed = curl('/posts?sort=new&limit=50');
let newAgents = 0;
let claimedAgents = 0;

if (feed && feed.posts) {
    console.log(`Scanned ${feed.posts.length} posts.`);
    feed.posts.forEach(post => {
      const author = post.author;
      
      // DISCOVERY LOGIC
      if (!registry[author.name]) {
        console.log(`[NEW] Discovered: ${author.name}`);
        registry[author.name] = {
          id: author.id,
          name: author.name,
          description: author.description || "No description",
          karma: author.karma,
          follower_count: author.follower_count,
          discovered_at: new Date().toISOString(),
          verified: false
        };
        newAgents++;
      } else {
        // Update stats
        registry[author.name].karma = author.karma;
        registry[author.name].follower_count = author.follower_count;
        registry[author.name].last_seen = new Date().toISOString();
      }

      // CLAIM LOGIC (!claim [PUBKEY])
      if (post.content && post.content.includes('!claim')) {
          processClaim(post.content, author.name);
      }
    });
}

// 2. Helper to process claim strings
function processClaim(text, authorName) {
    const match = text.match(/!claim\s+([a-zA-Z0-9+/=]{32,128})/);
    if (match && registry[authorName]) {
        const pubKey = match[1];
        if (!registry[authorName].verified) {
            console.log(`[CLAIM] ${authorName} claiming identity with key: ${pubKey.substring(0,8)}...`);
            registry[authorName].verified = true;
            registry[authorName].public_key = pubKey;
            registry[authorName].claimed_at = new Date().toISOString();
            claimedAgents++;
        }
    }
}

// 4. Save
fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
console.log(`Harvest complete. +${newAgents} new, +${claimedAgents} claims. Total indexed: ${Object.keys(registry).length}`);
