import { FileText } from '@appica/icons-react';
import { TaskPage } from './TaskPage.jsx';

export const tasksModule = {
  id: 'tasks',
  name: '待办事项',
  icon: FileText,
  path: '/tasks',
  Page: TaskPage
};

export { TaskPage };
