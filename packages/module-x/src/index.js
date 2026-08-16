import { LayoutGrid, LayoutDashboard, Book, FileText, Message, Palette, ChartBar } from '@appica/icons-react';
import { ContentTable } from './ContentTable.jsx';
import { AnalyticsPage } from './AnalyticsPage.jsx';
import { XOverviewPage, LibraryPage, MaterialsPage, RepliesPage, StylePage, Preference } from './XPages.jsx';

export const xModule = {
  id: 'x',
  name: 'X Assistant',
  icon: LayoutGrid,
  pages: {
    'x-overview': { name: 'X 概览', path: '/x-overview', icon: LayoutDashboard, Component: XOverviewPage },
    'library': { name: '内容库', path: '/library', icon: Book, Component: LibraryPage },
    'materials': { name: '素材库', path: '/materials', icon: FileText, Component: MaterialsPage },
    'replies': { name: '回复历史', path: '/replies', icon: Message, Component: RepliesPage },
    'style': { name: '个人风格', path: '/style', icon: Palette, Component: StylePage },
    'analytics-v2': { name: '数据统计', path: '/analytics', icon: ChartBar, Component: AnalyticsPage }
  }
};

export { ContentTable, AnalyticsPage, XOverviewPage, LibraryPage, MaterialsPage, RepliesPage, StylePage, Preference };
