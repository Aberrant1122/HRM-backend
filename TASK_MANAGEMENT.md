# Task Management System

This document describes the comprehensive task management system implemented in the HRM backend.

## Overview

The task management system allows users to:
- Create, read, update, and delete tasks
- Assign tasks to team members
- Track task progress and status
- Organize tasks by projects
- Set priorities and due dates
- Add comments and attachments
- Generate reports and statistics

## Models

### Task Model

The Task model includes the following fields:

- **id**: Primary key (auto-increment)
- **title**: Task title (required, 3-200 characters)
- **description**: Detailed task description
- **status**: Task status (pending, in-progress, completed, blocked, cancelled)
- **priority**: Task priority (low, medium, high, urgent)
- **dueDate**: Task due date
- **startDate**: Task start date
- **completedDate**: Task completion date (auto-set when completed)
- **estimatedHours**: Estimated time to complete
- **actualHours**: Actual time spent
- **assigneeId**: User assigned to the task
- **projectId**: Project the task belongs to
- **createdBy**: User who created the task
- **tags**: Array of tags for categorization
- **attachments**: Array of file attachments
- **comments**: Array of task comments
- **progress**: Task progress percentage (0-100)
- **isActive**: Soft delete flag
- **timestamps**: Created and updated timestamps

### Project Model

The Project model includes:

- **id**: Primary key (auto-increment)
- **name**: Project name (required, 3-100 characters)
- **description**: Project description
- **status**: Project status (planning, active, on-hold, completed, cancelled)
- **priority**: Project priority (low, medium, high, urgent)
- **startDate**: Project start date
- **endDate**: Project end date
- **budget**: Project budget
- **managerId**: Project manager (required)
- **clientName**: Client name
- **clientEmail**: Client email
- **tags**: Array of project tags
- **attachments**: Array of project attachments
- **progress**: Project progress percentage
- **isActive**: Soft delete flag
- **timestamps**: Created and updated timestamps

## API Endpoints

### Task Endpoints

#### Create Task
```
POST /api/tasks/create-task
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Task Title",
  "description": "Task description",
  "status": "pending",
  "priority": "medium",
  "dueDate": "2025-03-01T00:00:00.000Z",
  "assigneeId": 2,
  "projectId": 1,
  "estimatedHours": 16.0,
  "tags": ["frontend", "ui"]
}
```

#### Get All Tasks
```
GET /api/tasks/all-tasks
Authorization: Bearer <token>
```

Query Parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `status`: Filter by status
- `priority`: Filter by priority
- `assigneeId`: Filter by assignee
- `projectId`: Filter by project
- `search`: Search in title and description
- `sortBy`: Sort field (default: createdAt)
- `sortOrder`: Sort order ASC/DESC (default: DESC)

#### Get Task by ID
```
GET /api/tasks/get-task/:id
Authorization: Bearer <token>
```

#### Update Task
```
PUT /api/tasks/update-task/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Updated Task Title",
  "status": "in-progress",
  "progress": 50
}
```

#### Delete Task
```
DELETE /api/tasks/delete-task/:id
Authorization: Bearer <token>
```

#### Update Task Progress
```
PUT /api/tasks/update-task-progress/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "progress": 75
}
```

#### Change Task Status
```
PUT /api/tasks/change-task-status/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "status": "completed"
}
```

#### Assign Task to User
```
PUT /api/tasks/assign-task-to-user/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "assigneeId": 3
}
```

#### Get Tasks by Assignee
```
GET /api/tasks/assignee/:assigneeId
Authorization: Bearer <token>
```

#### Get Tasks by Project
```
GET /api/tasks/project/:projectId?page=1&limit=10
Authorization: Bearer <token>
```

#### Get Overdue Tasks
```
GET /api/tasks/overdue?page=1&limit=10
Authorization: Bearer <token>
```

#### Get Task Statistics
```
GET /api/tasks/statistics
Authorization: Bearer <token>
```

### Project Endpoints

#### Create Project
```
POST /api/projects
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Project Name",
  "description": "Project description",
  "status": "planning",
  "priority": "medium",
  "startDate": "2025-02-01T00:00:00.000Z",
  "endDate": "2025-05-01T00:00:00.000Z",
  "budget": 25000.00,
  "managerId": 1,
  "clientName": "Client Name",
  "clientEmail": "client@email.com"
}
```

#### Get All Projects
```
GET /api/projects?page=1&limit=10&status=active&priority=high&search=searchterm
Authorization: Bearer <token>
```

#### Get Project by ID
```
GET /api/projects/:id
Authorization: Bearer <token>
```

#### Update Project
```
PUT /api/projects/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Updated Project Name",
  "status": "active"
}
```

#### Delete Project
```
DELETE /api/projects/:id
Authorization: Bearer <token>
```

#### Update Project Progress
```
PUT /api/projects/:id/progress
Content-Type: application/json
Authorization: Bearer <token>

{
  "progress": 60
}
```

#### Change Project Status
```
PUT /api/projects/:id/status
Content-Type: application/json
Authorization: Bearer <token>

{
  "status": "active"
}
```

#### Get Projects by Manager
```
GET /api/projects/manager/:managerId?page=1&limit=10
Authorization: Bearer <token>
```

#### Get Project Statistics
```
GET /api/projects/statistics
Authorization: Bearer <token>
```

## Features

### Task Management
- **CRUD Operations**: Full create, read, update, delete functionality
- **Status Tracking**: Track task progress through different states
- **Priority Management**: Set and manage task priorities
- **Time Tracking**: Estimate and track actual hours spent
- **Assignment**: Assign tasks to team members
- **Due Dates**: Set and track task deadlines
- **Progress Updates**: Update task completion percentage
- **Comments**: Add and track task comments
- **Attachments**: Support for file attachments
- **Tags**: Categorize tasks with tags

### Project Management
- **Project Organization**: Group related tasks under projects
- **Project Status**: Track project lifecycle stages
- **Budget Management**: Set and track project budgets
- **Client Information**: Store client details
- **Manager Assignment**: Assign project managers
- **Progress Tracking**: Monitor overall project progress

### Advanced Features
- **Search and Filter**: Find tasks and projects quickly
- **Pagination**: Handle large numbers of items
- **Sorting**: Sort by various fields
- **Statistics**: Generate reports and analytics
- **Overdue Tracking**: Identify delayed tasks
- **Soft Delete**: Preserve data integrity
- **Validation**: Comprehensive input validation
- **Error Handling**: Proper error responses

## Database Migrations

Run the following migrations to set up the database:

```bash
# Create projects table
npx sequelize-cli db:migrate --name 20250220000000-create-projects-table

# Create tasks table
npx sequelize-cli db:migrate --name 20250220000001-create-tasks-table
```

## Seeding

Populate the database with sample data:

```bash
npx sequelize-cli db:seed --seed 20250220000000-project-task-seed
```

## Usage Examples

### Creating a Task
```javascript
const response = await fetch('/api/tasks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    title: 'Implement User Authentication',
    description: 'Add JWT-based authentication to the API',
    priority: 'high',
    dueDate: '2025-03-15T00:00:00.000Z',
    assigneeId: 2,
    projectId: 1,
    estimatedHours: 24.0
  })
});

const task = await response.json();
```

### Updating Task Progress
```javascript
const response = await fetch(`/api/tasks/${taskId}/progress`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    progress: 75
  })
});
```

### Getting Tasks with Filters
```javascript
const response = await fetch('/api/tasks?status=in-progress&priority=high&page=1&limit=20', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const { data: tasks, pagination } = await response.json();
```

## Error Handling

The API returns consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (missing/invalid token)
- `404`: Not Found
- `500`: Internal Server Error

## Security

- All endpoints require authentication via JWT tokens
- Input validation prevents malicious data
- Soft delete preserves data integrity
- Proper error handling prevents information leakage

## Performance

- Database indexes on frequently queried fields
- Pagination for large datasets
- Efficient database queries with associations
- JSON fields for flexible data storage

## Future Enhancements

- File upload for attachments
- Real-time notifications
- Task dependencies and subtasks
- Time tracking integration
- Advanced reporting and analytics
- Email notifications
- Calendar integration
- Mobile app support
