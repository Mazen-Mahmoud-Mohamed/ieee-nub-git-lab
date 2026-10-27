import { NavLink } from 'react-router-dom';
export function StudentSteps({ basePath = '' }: { basePath?: string }) {
  return (
    <nav className="student-steps" aria-label="Assessment steps">
      <NavLink to={basePath + '/workspace'}>Workspace</NavLink>
      <NavLink to={basePath + '/theory'}>Questions</NavLink>
      <NavLink to={basePath + '/review'}>Review & submit</NavLink>
    </nav>
  );
}
