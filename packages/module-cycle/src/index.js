import { ChartLine } from '@appica/icons-react';
import { MenstrualCyclePage } from './MenstrualCyclePage.jsx';

export const cycleModule = {
  id: 'cycle',
  name: '健康',
  icon: ChartLine,
  pages: {
    'menstrual-cycle': { name: '经期', path: '/health/menstrual-cycle', icon: ChartLine, Component: MenstrualCyclePage }
  }
};

export { MenstrualCyclePage };
