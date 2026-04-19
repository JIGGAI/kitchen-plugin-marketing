# Kitchen Plugin Marketing

A comprehensive marketing suite plugin for ClawKitchen that provides content management, scheduling, analytics, and social media integration.

> **⚠ Postiz is required.** Social publishing is currently wired only through Postiz (https://postiz.com). The driver layer has placeholders for gateway and direct-API backends but Postiz is the only production-grade path today. Treat Postiz as a hard requirement.

> **📖 Setting up marketing → social handoff?** See [`docs/SOCIAL_EXECUTION_SETUP.md`](./docs/SOCIAL_EXECUTION_SETUP.md) for the full two-team setup guide: plugin installation on both teams, Postiz configuration, workflow naming conventions the editor picker relies on, and a demo walkthrough from content generation to per-platform publishing.

## Installation

### Via Kitchen CLI
```bash
openclaw kitchen plugins install @jiggai/kitchen-plugin-marketing
```

### Via NPM
```bash
npm install @jiggai/kitchen-plugin-marketing
```

### Manual Installation
```bash
cd /path/to/clawkitchen
npm install @jiggai/kitchen-plugin-marketing
npm run build
# Restart gateway
```

## Features

### 🎯 **Complete API Access**
Every feature available in the UI is accessible via REST APIs, allowing developers to:
- Build custom frontends (React, Vue, mobile apps)
- Create headless integrations
- Develop CLI tools and automation
- Integrate with external systems

### 📱 **Plugin Tabs**
- **Content Library** - Manage marketing assets, templates, and media
- **Content Calendar** - Schedule and plan content across platforms
- **Analytics** - Track engagement, reach, and performance metrics
- **Accounts** - Connect and manage social media accounts

## API Reference

All plugin APIs are available under the path:
```
/api/plugins/kitchen-plugin-marketing/<endpoint>
```

### Content Management

#### Posts
```bash
# Get all posts
GET /api/plugins/kitchen-plugin-marketing/posts

# Create new post
POST /api/plugins/kitchen-plugin-marketing/posts
{
  "content": "Your post content",
  "platforms": ["twitter", "linkedin"],
  "scheduledAt": "2026-04-06T10:00:00Z",
  "status": "draft"
}

# Get specific post
GET /api/plugins/kitchen-plugin-marketing/posts/{id}

# Update post
PUT /api/plugins/kitchen-plugin-marketing/posts/{id}

# Delete post
DELETE /api/plugins/kitchen-plugin-marketing/posts/{id}

# Publish post immediately
POST /api/plugins/kitchen-plugin-marketing/posts/{id}/publish
```

#### Content Library
```bash
# Get all media assets
GET /api/plugins/kitchen-plugin-marketing/media

# Upload new asset
POST /api/plugins/kitchen-plugin-marketing/media
Content-Type: multipart/form-data

# Get templates
GET /api/plugins/kitchen-plugin-marketing/templates

# Create template
POST /api/plugins/kitchen-plugin-marketing/templates
```

### Analytics

```bash
# Get overview metrics
GET /api/plugins/kitchen-plugin-marketing/analytics/overview

# Get engagement data
GET /api/plugins/kitchen-plugin-marketing/analytics/engagement
?platform=twitter&start=2026-04-01&end=2026-04-07

# Get reach metrics
GET /api/plugins/kitchen-plugin-marketing/analytics/reach

# Get performance by post
GET /api/plugins/kitchen-plugin-marketing/analytics/posts/{id}/performance
```

### Social Accounts

```bash
# Get connected accounts
GET /api/plugins/kitchen-plugin-marketing/accounts

# Connect new account
POST /api/plugins/kitchen-plugin-marketing/accounts
{
  "platform": "twitter",
  "credentials": {...}
}

# Disconnect account
DELETE /api/plugins/kitchen-plugin-marketing/accounts/{id}

# Get account metrics
GET /api/plugins/kitchen-plugin-marketing/accounts/{id}/metrics
```

### Calendar & Scheduling

```bash
# Get calendar view
GET /api/plugins/kitchen-plugin-marketing/calendar
?start=2026-04-01&end=2026-04-30

# Schedule post
POST /api/plugins/kitchen-plugin-marketing/calendar/schedule
{
  "postId": "123",
  "scheduledAt": "2026-04-06T14:00:00Z",
  "platforms": ["twitter"]
}

# Get scheduled posts
GET /api/plugins/kitchen-plugin-marketing/calendar/scheduled

# Reschedule post
PUT /api/plugins/kitchen-plugin-marketing/calendar/scheduled/{id}
```

## Development

### Building the Plugin
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

### Plugin Structure
```
src/
├── api/
│   └── routes.ts          # REST API endpoints
├── tabs/
│   ├── content-library.tsx
│   ├── content-calendar.tsx
│   ├── analytics.tsx
│   └── accounts.tsx
├── db/
│   └── schema.ts          # Database schema
└── types/
    └── index.ts           # TypeScript types

dist/                      # Built output
├── api/routes.js
└── tabs/*.js

db/migrations/             # Database migrations
```

## Plugin Architecture

### Database
Each plugin gets an isolated SQLite database with encrypted credentials storage.

### Security
- Credentials encrypted at rest using AES-256-GCM
- Team-scoped access controls
- No cross-plugin data access

### Integration Points
- **Team Detection**: Available when installed, and can be enabled per team from the Kitchen Plugins tab. The plugin advertises support for `marketing-team`.
- **Kitchen Auth**: Uses existing Kitchen authentication
- **API Discovery**: All endpoints automatically available via Kitchen's plugin router

## Custom Frontend Integration

Since all features are API-accessible, you can build custom interfaces:

```javascript
// Example: Custom React component using plugin APIs
const useMarketingPosts = () => {
  return fetch('/api/plugins/kitchen-plugin-marketing/posts')
    .then(res => res.json());
};

// Example: Mobile app integration
const schedulePost = async (content, platforms, scheduledAt) => {
  return fetch('/api/plugins/kitchen-plugin-marketing/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, platforms, scheduledAt })
  });
};
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT

## Support

- Issues: [GitHub Issues](https://github.com/JIGGAI/kitchen-plugin-marketing/issues)
- Documentation: [Plugin Documentation](https://docs.clawkitchen.ai/plugins/marketing)