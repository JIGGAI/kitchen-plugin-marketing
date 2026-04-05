# Kitchen Plugin Marketing - API Examples

## Complete API Reference with Examples

### Authentication
All requests inherit Kitchen's authentication. Use the same session/auth as the Kitchen UI.

### Base URL
```
http://your-kitchen-instance/api/plugins/kitchen-plugin-marketing
```

## Content Management APIs

### Posts Management

#### Create Post
```bash
curl -X POST /api/plugins/kitchen-plugin-marketing/posts \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Exciting product launch coming soon! 🚀",
    "platforms": ["twitter", "linkedin"],
    "scheduledAt": "2026-04-06T14:00:00Z",
    "status": "scheduled",
    "tags": ["product-launch", "marketing"],
    "mediaIds": ["media123", "media456"]
  }'
```

#### Get All Posts
```bash
# With filtering and pagination
curl "/api/plugins/kitchen-plugin-marketing/posts?status=published&platform=twitter&limit=20&offset=0"

# Response:
{
  "posts": [
    {
      "id": "post123",
      "content": "Product launch post",
      "platforms": ["twitter"],
      "status": "published",
      "publishedAt": "2026-04-05T10:00:00Z",
      "metrics": {
        "impressions": 1250,
        "engagements": 45,
        "clicks": 12
      }
    }
  ],
  "total": 156,
  "hasMore": true
}
```

#### Update Post
```bash
curl -X PUT /api/plugins/kitchen-plugin-marketing/posts/post123 \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Updated content with new CTA",
    "scheduledAt": "2026-04-06T16:00:00Z"
  }'
```

#### Publish Post Immediately
```bash
curl -X POST /api/plugins/kitchen-plugin-marketing/posts/post123/publish \
  -d '{"platforms": ["twitter", "linkedin"]}'
```

### Content Library

#### Upload Media Asset
```bash
curl -X POST /api/plugins/kitchen-plugin-marketing/media \
  -F "file=@marketing-image.png" \
  -F "alt=Product hero image" \
  -F "tags=product,hero,launch"

# Response:
{
  "id": "media789",
  "filename": "marketing-image.png",
  "url": "/api/plugins/kitchen-plugin-marketing/media/media789/file",
  "alt": "Product hero image",
  "tags": ["product", "hero", "launch"],
  "size": 245760,
  "dimensions": { "width": 1200, "height": 600 }
}
```

#### Get Media Library
```bash
curl "/api/plugins/kitchen-plugin-marketing/media?tag=product&type=image"

# Response:
{
  "media": [
    {
      "id": "media789",
      "filename": "marketing-image.png",
      "url": "/api/plugins/kitchen-plugin-marketing/media/media789/file",
      "thumbnail": "/api/plugins/kitchen-plugin-marketing/media/media789/thumbnail",
      "alt": "Product hero image",
      "tags": ["product", "hero", "launch"],
      "createdAt": "2026-04-05T09:30:00Z"
    }
  ]
}
```

#### Create Content Template
```bash
curl -X POST /api/plugins/kitchen-plugin-marketing/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Product Launch Template",
    "content": "🚀 Introducing {{product_name}}!\n\n{{description}}\n\n👉 Learn more: {{link}}",
    "variables": [
      {"name": "product_name", "type": "text", "required": true},
      {"name": "description", "type": "text", "required": true},
      {"name": "link", "type": "url", "required": false}
    ],
    "tags": ["product-launch", "template"]
  }'
```

## Analytics APIs

#### Overview Metrics
```bash
curl "/api/plugins/kitchen-plugin-marketing/analytics/overview?period=30d"

# Response:
{
  "period": "30d",
  "metrics": {
    "totalPosts": 45,
    "totalImpressions": 125000,
    "totalEngagements": 3400,
    "totalClicks": 890,
    "engagementRate": 2.72,
    "averageImpressions": 2778
  },
  "platformBreakdown": {
    "twitter": {
      "posts": 25,
      "impressions": 75000,
      "engagements": 2100
    },
    "linkedin": {
      "posts": 20,
      "impressions": 50000,
      "engagements": 1300
    }
  }
}
```

#### Engagement Analytics
```bash
curl "/api/plugins/kitchen-plugin-marketing/analytics/engagement?platform=twitter&start=2026-04-01&end=2026-04-07"

# Response:
{
  "platform": "twitter",
  "period": "2026-04-01 to 2026-04-07",
  "dailyEngagements": [
    {"date": "2026-04-01", "likes": 45, "retweets": 12, "replies": 8, "total": 65},
    {"date": "2026-04-02", "likes": 52, "retweets": 15, "replies": 6, "total": 73}
  ],
  "topPosts": [
    {
      "id": "post123",
      "content": "Product launch post...",
      "engagements": 125,
      "impressions": 3400
    }
  ]
}
```

#### Post Performance
```bash
curl "/api/plugins/kitchen-plugin-marketing/analytics/posts/post123/performance"

# Response:
{
  "post": {
    "id": "post123",
    "content": "Exciting product launch...",
    "publishedAt": "2026-04-05T10:00:00Z"
  },
  "performance": {
    "twitter": {
      "impressions": 2400,
      "likes": 45,
      "retweets": 12,
      "replies": 8,
      "clicks": 23
    },
    "linkedin": {
      "impressions": 1800,
      "likes": 67,
      "comments": 15,
      "shares": 8,
      "clicks": 34
    }
  },
  "comparison": {
    "vsAverage": {
      "impressions": "+15%",
      "engagements": "+22%"
    }
  }
}
```

## Social Account Management

#### Connect Social Account
```bash
curl -X POST /api/plugins/kitchen-plugin-marketing/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "twitter",
    "displayName": "Company Twitter",
    "credentials": {
      "accessToken": "...",
      "refreshToken": "...",
      "expiresAt": "2027-04-05T10:00:00Z"
    },
    "settings": {
      "autoPost": true,
      "defaultHashtags": ["startup", "tech"]
    }
  }'
```

#### Get Connected Accounts
```bash
curl "/api/plugins/kitchen-plugin-marketing/accounts"

# Response:
{
  "accounts": [
    {
      "id": "acc123",
      "platform": "twitter",
      "displayName": "Company Twitter",
      "username": "@yourcompany",
      "avatar": "https://...",
      "isActive": true,
      "lastSync": "2026-04-05T10:30:00Z",
      "metrics": {
        "followers": 1250,
        "following": 340
      }
    }
  ]
}
```

#### Account Metrics
```bash
curl "/api/plugins/kitchen-plugin-marketing/accounts/acc123/metrics?period=7d"

# Response:
{
  "account": {
    "id": "acc123",
    "platform": "twitter",
    "username": "@yourcompany"
  },
  "period": "7d",
  "metrics": {
    "followerGrowth": 15,
    "postsPublished": 8,
    "totalImpressions": 15000,
    "totalEngagements": 450,
    "topPost": {
      "id": "post456",
      "engagements": 125
    }
  }
}
```

## Calendar & Scheduling

#### Get Calendar View
```bash
curl "/api/plugins/kitchen-plugin-marketing/calendar?start=2026-04-01&end=2026-04-30&view=month"

# Response:
{
  "view": "month",
  "period": "2026-04-01 to 2026-04-30",
  "events": [
    {
      "date": "2026-04-06",
      "posts": [
        {
          "id": "post123",
          "content": "Product launch announcement",
          "scheduledAt": "2026-04-06T14:00:00Z",
          "platforms": ["twitter", "linkedin"],
          "status": "scheduled"
        }
      ]
    }
  ],
  "summary": {
    "totalScheduled": 15,
    "byPlatform": {
      "twitter": 10,
      "linkedin": 8,
      "instagram": 5
    }
  }
}
```

#### Bulk Schedule Posts
```bash
curl -X POST /api/plugins/kitchen-plugin-marketing/calendar/bulk-schedule \
  -H "Content-Type: application/json" \
  -d '{
    "posts": [
      {
        "content": "Monday motivation post",
        "scheduledAt": "2026-04-07T09:00:00Z",
        "platforms": ["twitter"]
      },
      {
        "content": "Tuesday tech tip",
        "scheduledAt": "2026-04-08T14:00:00Z",
        "platforms": ["linkedin"]
      }
    ]
  }'
```

## Webhook Integration

#### Set Up Webhooks
```bash
curl -X POST /api/plugins/kitchen-plugin-marketing/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/marketing",
    "events": ["post.published", "post.failed", "analytics.updated"],
    "secret": "your-webhook-secret"
  }'
```

## Custom Frontend Examples

### React Integration
```javascript
// Custom React hook for marketing data
import { useState, useEffect } from 'react';

const useMarketingPosts = (filters = {}) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      const params = new URLSearchParams(filters);
      const response = await fetch(`/api/plugins/kitchen-plugin-marketing/posts?${params}`);
      const data = await response.json();
      setPosts(data.posts);
      setLoading(false);
    };
    
    fetchPosts();
  }, [filters]);

  return { posts, loading };
};

// Usage in component
const MarketingDashboard = () => {
  const { posts, loading } = useMarketingPosts({ status: 'published', limit: 10 });
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
};
```

### Mobile App Integration
```javascript
// React Native example
import AsyncStorage from '@react-native-async-storage/async-storage';

class MarketingAPI {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  async request(endpoint, options = {}) {
    const token = await AsyncStorage.getItem('auth_token');
    
    return fetch(`${this.baseURL}/api/plugins/kitchen-plugin-marketing${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    }).then(res => res.json());
  }

  async createPost(postData) {
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify(postData)
    });
  }

  async getAnalytics(period = '30d') {
    return this.request(`/analytics/overview?period=${period}`);
  }
}
```

This comprehensive API allows you to build any kind of custom interface while leveraging all the plugin's marketing functionality!