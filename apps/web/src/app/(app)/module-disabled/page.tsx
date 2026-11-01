import { ModuleDisabledNotice } from '../../../components/module-layout';

/** Shown in place of any page of a module a ผู้ดูแลระบบ switched off; the proxy rewrites to it with status 403. */
export default function ModuleDisabledPage() {
  return <ModuleDisabledNotice />;
}
