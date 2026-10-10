import { FileSpreadsheet, Lock, Palette, Scale, Shapes } from 'lucide-react';
import { Link } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEnumParam } from '@/hooks/useSearchParamState';

import { AccessTab } from './AccessTab';
import { CategoriesTab } from './CategoriesTab';
import { ScoringTab } from './ScoringTab';
import { SheetsTab } from './SheetsTab';

const TABS = ['sheets', 'categories', 'scoring', 'access'] as const;

export default function SettingsPage() {
  const [tab, setTab] = useEnumParam('tab', TABS, 'sheets');
  return (
    <>
      <PageHeader
        title="Settings"
        description="Google Sheets sync, task categories, how monthly scores are weighted, and who can join."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/styleguide">
              <Palette /> Design system
            </Link>
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 scrollbar-thin sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="sheets">
              <FileSpreadsheet aria-hidden /> Google Sheets
            </TabsTrigger>
            <TabsTrigger value="categories">
              <Shapes aria-hidden /> Categories
            </TabsTrigger>
            <TabsTrigger value="scoring">
              <Scale aria-hidden /> Scoring
            </TabsTrigger>
            <TabsTrigger value="access">
              <Lock aria-hidden /> Access
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="sheets">
          <SheetsTab />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="scoring">
          <ScoringTab />
        </TabsContent>
        <TabsContent value="access">
          <AccessTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
