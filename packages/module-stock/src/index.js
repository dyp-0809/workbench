import { ChartBar, Database } from '@appica/icons-react';
import { StockStatsPage } from './StockStatsPage.jsx';
import { StockPositionsPage } from './StockPositionsPage.jsx';

export const stockModule = {
  id: 'stock',
  name: '股票',
  icon: ChartBar,
  pages: {
    'stock-stats': { name: '统计', path: '/stock/stats', icon: ChartBar, Component: StockStatsPage },
    'stock-positions': { name: '仓位管理', path: '/stock/positions', icon: Database, Component: StockPositionsPage }
  }
};

export { StockStatsPage, StockPositionsPage };
