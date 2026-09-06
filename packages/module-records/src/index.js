import { Book, Books } from '@appica/icons-react';
import { ProgrammingRecordsPage } from './ProgrammingRecordsPage.jsx';

export const programmingModule = {
  id: 'programming',
  name: '编程',
  icon: Books,
  pages: {
    'programming-records': { name: '记录', path: '/programming/records', icon: Book, Component: ProgrammingRecordsPage }
  }
};

export { ProgrammingRecordsPage };
