import { useState } from 'react';
export function PracticeIdentity({ onSave }: { onSave: () => void }) {
  const [error, setError] = useState('');
  return (
    <form
      className="practice-identity"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const name = String(data.get('name')).trim();
        const department = String(data.get('department')).trim();
        if (!name || !department) {
          setError('Enter your practice name and department.');
          return;
        }
        localStorage.setItem('practice-name', name);
        localStorage.setItem('practice-department', department);
        onSave();
      }}
    >
      <span>Local practice identity</span>
      <input
        aria-label="Practice full name"
        name="name"
        placeholder="Your full name"
        maxLength={120}
        required
      />
      <input
        aria-label="Practice department"
        name="department"
        placeholder="Your department"
        maxLength={120}
        required
      />
      <button className="small-button">Save on this device</button>
      {error && <span role="alert">{error}</span>}
    </form>
  );
}
