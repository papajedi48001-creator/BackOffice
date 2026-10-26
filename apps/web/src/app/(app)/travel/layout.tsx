import { ModuleLayout } from '../../../components/module-layout';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ModuleLayout code="official-travel">{children}</ModuleLayout>;
}
