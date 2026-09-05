import { ChartBar, Database } from '@appica/icons-react';
import { StockStatsPage } from './StockStatsPage.jsx';
import { StockPositionsPage } from './StockPositionsPage.jsx';
import { StockEntryPlansPage } from './StockEntryPlansPage.jsx';
import { StockMarketPage } from './StockMarketPage.jsx';

export const stockModule = {
  id: 'stock',
  name: '股票',
  icon: ChartBar,
  pages: {
    'stock-entry-plans': { name: '待开仓股票', path: '/stock/entry-plans', icon: Database, Component: StockEntryPlansPage },
    'stock-market': { name: '市场', path: '/stock/market', icon: ChartBar, Component: StockMarketPage },
    'stock-positions': { name: '仓位管理', path: '/stock/positions', icon: Database, Component: StockPositionsPage }
  }
};

export { StockStatsPage, StockPositionsPage, StockEntryPlansPage, StockMarketPage };
