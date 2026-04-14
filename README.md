# Kitchen Plugin Marketing

A comprehensive marketing suite plugin for ClawKitchen that provides content management, scheduling, analytics, and social media integration.

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
/api/plugins/marketing/<endpoint>
```

Pass team context explicitly with `teamId=<team-id>` or the `x-team-id` header. `teamId` is the preferred query parameter.

### Content Management

#### Posts
```bash
# Get all posts
GET /api/plugins/marketing/posts?teamId=<team-id>

# Create new post
POST /api/plugins/marketing/posts?teamId=<team-id>
{
  "content": "Your post content",
  "platforms": ["twitter", "linkedin"],
  "scheduledAt": "2026-04-06T10:00:00Z",
  "status": "draft"
}

# Get specific post
GET /api/plugins/marketing/posts/{id}?teamId=<team-id>

# Update post
PUT /api/plugins/marketing/posts/{id}?teamId=<team-id>

# Delete post
DELETE /api/plugins/marketing/posts/{id}?teamId=<team-id>

# Publish post immediately
POST /api/plugins/marketing/posts/{id}/publish?teamId=<team-id>
```

#### Content Library
```bash
# Get all media assets
GET /api/plugins/marketing/media?teamId=<team-id>

# Upload new asset
POST /api/plugins/marketing/media?teamId=<team-id>
Content-Type: multipart/form-data

# Get templates
GET /api/plugins/marketing/templates?teamId=<team-id>

# Create template
POST /api/plugins/marketing/templates?teamId=<team-id>
```

### Analytics

```bash
# Get overview metrics
GET /api/plugins/marketing/analytics/overview?teamId=<team-id>

# Get engagement data
GET /api/plugins/marketing/analytics/engagement
?teamId=<team-id>&platform=twitter&start=2026-04-01&end=2026-04-07

# Get reach metrics
GET /api/plugins/marketing/analytics/reach?teamId=<team-id>

# Get performance by post
GET /api/plugins/marketing/analytics/posts/{id}/performance?teamId=<team-id>
```

### Social Accounts

```bash
# Get connected accounts
GET /api/plugins/marketing/accounts?teamId=<team-id>

# Connect new account
POST /api/plugins/marketing/accounts?teamId=<team-id>
{
  "platform": "twitter",
  "credentials": {...}
}

# Disconnect account
DELETE /api/plugins/marketing/accounts/{id}?teamId=<team-id>

# Get account metrics
GET /api/plugins/marketing/accounts/{id}/metrics?teamId=<team-id>
```

### Calendar & Scheduling

```bash
# Get calendar view
GET /api/plugins/marketing/calendar
?teamId=<team-id>&start=2026-04-01&end=2026-04-30

# Schedule post
POST /api/plugins/marketing/calendar/schedule?teamId=<team-id>
{
  "postId": "123",
  "scheduledAt": "2026-04-06T14:00:00Z",
  "platforms": ["twitter"]
}

# Get scheduled posts
GET /api/plugins/marketing/calendar/scheduled?teamId=<team-id>

# Reschedule post
PUT /api/plugins/marketing/calendar/scheduled/{id}?teamId=<team-id>
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

The sqlite bindings are lazy-loaded inside the DB helpers so Kitchen can discover and mount the plugin without requiring the native module during top-level bootstrap.

### Security
- Credentials are encrypted at rest with the plugin's existing compatibility key path
- Team-scoped access controls
- No cross-plugin data access
- No `CK_BASE_URL`, `KITCHEN_PLUGIN_DB_PATH`, or `KITCHEN_ENCRYPTION_KEY` env fallback is required for normal operation

### Integration Points
- **Team Detection**: Available when installed, and can be enabled per team from the Kitchen Plugins tab. The plugin advertises support for `marketing-team`.
- **Kitchen Auth**: Uses existing Kitchen authentication
- **API Discovery**: All endpoints automatically available via Kitchen's plugin router

## Custom Frontend Integration

Since all features are API-accessible, you can build custom interfaces:

```javascript
// Example: Custom React component using plugin APIs
const useMarketingPosts = () => {
  return fetch('/api/plugins/marketing/posts?teamId=hmx-marketing-team')
    .then(res => res.json());
};

// Example: Mobile app integration
const schedulePost = async (content, platforms, scheduledAt) => {
  return fetch('/api/plugins/marketing/posts?teamId=hmx-marketing-team', {
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