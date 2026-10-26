import { useEffect, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { supabase } from '../services/supabase';
import {
  firstAssessment,
  type Definition,
  type AssessmentRecord,
  type AttemptState,
} from '../features/assessments/model';
import { ASSIGNMENT_ID } from '../features/assignments/assignment';
export function useAssessmentRoute(userId?: string) {
  const assessmentMatch = useMatch('/assessments/:assessmentId/*');
  const attemptMatch = useMatch('/assessments/:assessmentId/attempts/:attemptId/*');
  const assessmentId = assessmentMatch?.params.assessmentId;
  const attemptId = attemptMatch?.params.attemptId;
  const [definition, setDefinition] = useState<Definition>(firstAssessment);
  const [record, setRecord] = useState<AssessmentRecord>();
  const [state, setState] = useState<AttemptState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setState(null);
    setError('');
    setDefinition(firstAssessment);
    if (!assessmentId) {
      setLoading(false);
      return;
    }
    if (!supabase || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      if (attemptId) {
        const { data, error } = await supabase!.rpc('assessment_state', { p_attempt: attemptId });
        if (error) throw error;
        if (data.assignment_id !== assessmentId)
          throw new Error('Attempt does not belong to this assessment');
        if (live) {
          setState(data);
          setDefinition(data.definition);
        }
      } else {
        const { data, error } = await supabase!
          .from('assignments')
          .select('*')
          .eq('id', assessmentId)
          .single();
        if (error) throw error;
        const { data: version, error: versionError } = await supabase!
          .from('assessment_versions')
          .select('document')
          .eq('assessment_id', assessmentId)
          .eq('version', data.published_version)
          .single();
        if (versionError) throw versionError;
        if (live) {
          setRecord(data);
          setDefinition(version.document);
        }
      }
    })()
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [assessmentId, attemptId, userId]);
  return {
    assessmentId: assessmentId || ASSIGNMENT_ID,
    attemptId,
    definition,
    record,
    state,
    loading,
    error,
    active: !!attemptId,
    basePath: attemptId ? `/assessments/${assessmentId}/attempts/${attemptId}` : '',
    detailsPath: assessmentId ? `/assessments/${assessmentId}` : '/overview',
  };
}
