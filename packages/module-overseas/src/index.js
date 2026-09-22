import { Database } from '@appica/icons-react';
import { OverseasPage } from './OverseasPage.jsx';

export const overseasModule = {
  id: 'overseas',
  name: '出海',
  icon: Database,
  pages: {
    overseas: { name: '出海', path: '/overseas', icon: Database, Component: OverseasPage }
  }
};

export { OverseasPage };
