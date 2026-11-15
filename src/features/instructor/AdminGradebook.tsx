import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminError } from './adminData';
import { loadCourseGradebook } from './gradebookData';
import { Pagination } from './AdminPages';
import type { CourseGrade } from '../assessments/CourseGrades';

export function AdminGradebook() {
  const [rows, setRows] = useState<CourseGrade[]>(),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [eligibility, setEligibility] = useState(''),
    [page, setPage] = useState(0),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setRows(undefined);
    setError('');
    void loadCourseGradebook()
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Course totals are temporarily unavailable.');
        if (live) setRows(data);
      })
      .catch((e) => {
        if (live) setError(adminError(e));
      });
    return () => {
      live = false;
    };
  }, [refresh]);
  const filtered = (rows || []).filter(
    (r) =>
      r.full_name?.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (!eligibility ||
        (eligibility === 'eligible'
          ? r.eligible
          : eligibility === 'pending'
            ? r.completed_components < 3
            : !r.eligible && r.completed_components === 3)),
  );
  return (
    <section>
      <div className="admin-card-heading">
        <div>
          <h2>Released course totals</h2>
          <p>Task 1 · 150 points &nbsp; Task 2 · 150 &nbsp; Final Exam · 200</p>
        </div>
        <span className="status-badge">500 points total</span>
      </div>
      <p className="admin-inline-note">
        Only the best finalized, released result in each course slot counts. Certificate eligibility
        requires all three components and at least 400 combined points.
      </p>
      <div className="table-toolbar">
        <input
          aria-label="Search course totals"
          placeholder="Find a student by name"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Certificate eligibility"
          value={eligibility}
          onChange={(e) => {
            setEligibility(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All students</option>
          <option value="eligible">Certificate eligible</option>
          <option value="pending">Components pending</option>
          <option value="ineligible">Below threshold</option>
        </select>
        <button className="outline-button" onClick={() => setRefresh((n) => n + 1)}>
          Refresh totals
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!rows && !error ? (
        <p role="status">Loading course totals…</p>
      ) : (
        rows && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      'Student',
                      'Task 1 / 150',
                      'Task 2 / 150',
                      'Final / 200',
                      'Total / 500',
                      'Certificate',
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(page * 25, page * 25 + 25).map((r) => (
                    <tr key={r.student_id}>
                      <td>
                        <Link to={'/instructor/students?student=' + r.student_id}>
                          {r.full_name}
                        </Link>
                      </td>
                      <td>{r.task1}</td>
                      <td>{r.task2}</td>
                      <td>{r.final}</td>
                      <td>
                        <strong>{r.total}</strong>
                      </td>
                      <td>
                        <span
                          className="status-badge"
                          data-tone={r.eligible ? 'published' : 'draft'}
                        >
                          {r.completed_components < 3
                            ? 'Components pending'
                            : r.eligible
                              ? 'Eligible'
                              : 'Below 400'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <p className="empty-state">No released totals match your filters.</p>
              )}
            </div>
            <Pagination page={page} total={filtered.length} onPage={setPage} />
          </>
        )
      )}
    </section>
  );
}
