import { Bolt, FileText } from '@appica/icons-react';
import { PromptPage } from './PromptPage.jsx';
import { SkillsPage } from './SkillsPage.jsx';
import { AIDashboardPage } from './AIDashboardPage.jsx';

export const aiModule = {
  id: 'ai',
  name: 'AI',
  icon: Bolt,
  pages: {
    'ai-overview': { name: 'AI 总览', path: '/ai', icon: FileText, Component: AIDashboardPage },
    'ai-prompts': { name: '提示词', path: '/ai/prompts', icon: FileText, Component: PromptPage },
    'ai-skills': { name: 'Skills', path: '/ai/skills', icon: FileText, Component: SkillsPage }
  }
};
export { AIDashboardPage };
export { SkillsPage };

export { PromptPage };
