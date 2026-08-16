import { Database } from '@appica/icons-react';
import { ExpiringItemsPage } from './ExpiringItemsPage.jsx';

export const expiringModule = {
  id: 'expiring',
  name: '到期与提醒',
  icon: Database,
  path: '/expiring',
  Page: ExpiringItemsPage
};

export { ExpiringItemsPage };
