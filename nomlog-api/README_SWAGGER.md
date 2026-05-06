# API Documentation

## Swagger UI (Local)

Start your API server and visit:
```
http://localhost:3001/api-docs
```

This provides an interactive API documentation interface where you can:
- Browse all endpoints
- Test API calls directly from the browser
- See request/response schemas
- Copy curl commands

## Import into Postman

1. Open Postman
2. Click **Import** button (top left)
3. Select **File** tab
4. Choose `swagger.yaml` from the project root
5. Postman will automatically:
   - Create a collection with all endpoints
   - Set up authentication (Bearer token)
   - Include example requests

## Import into Insomnia

1. Open Insomnia
2. Go to **Application** > **Preferences** > **Data**
3. Click **Import Data** > **From File**
4. Select `swagger.yaml`
5. All endpoints will be imported with proper authentication

## Using the API

### 1. Get an Access Token

First, authenticate to get a token:

```bash
POST /api/v1/auth/login
{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

Copy the `access_token` from the response.

### 2. Use the Token

For all authenticated endpoints, include the token in the Authorization header:

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### 3. Set Your Goals

```bash
PATCH /api/v1/users/profile
Authorization: Bearer YOUR_ACCESS_TOKEN
{
  "daily_calorie_goal": 2900,
  "daily_protein_goal": 180,
  "daily_carb_goal": 300,
  "daily_fat_goal": 110,
  "weight": 195
}
```

## OpenAPI Spec

The `swagger.yaml` file follows OpenAPI 3.0.3 specification and can be:
- Imported into any OpenAPI-compatible tool
- Used with code generators
- Shared with frontend teams
- Used for API testing automation
