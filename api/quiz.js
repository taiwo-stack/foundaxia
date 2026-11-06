// Student quiz endpoint.
//   { action: 'list' }                      -> { tasks } for the student's enrolled courses,
//                                              with quiz answer keys removed
//   { action: 'submit', taskId, answers }   -> grades on the server, saves the submission
//                                              with grade = points out of max_points
// Students can't read the tasks table directly (RLS), so the answer key never reaches
// the browser before submission, and the score can't be forged client-side.
import { authenticate, getUserIds, setCors, sendError, HttpError } from './_lib.js';
import { randomUUID } from 'crypto';

const parseQuestions = (raw) => {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]') || []; } catch { return []; }
};

const stripAnswers = (task) => {
  const questions = parseQuestions(task.quiz_questions);
  if (questions.length === 0) return task;
  // eslint-disable-next-line no-unused-vars
  const safe = questions.map(({ correct, answer, correct_answer, ...rest }) => rest);
  return { ...task, quiz_questions: safe };
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user, adminClient } = await authenticate(req);
    const { studentIds } = await getUserIds(adminClient, user.id);
    if (studentIds.length === 0) throw new HttpError(403, 'Only students can use this endpoint');

    const { data: enrollments, error: enrErr } = await adminClient
      .from('student_courses')
      .select('course_id')
      .in('student_id', studentIds);
    if (enrErr) throw enrErr;
    const courseIds = [...new Set((enrollments || []).map(e => e.course_id))];

    const { action } = req.body || {};

    if (action === 'list') {
      if (courseIds.length === 0) return res.status(200).json({ tasks: [] });
      const { data: tasks, error } = await adminClient.from('tasks').select('*').in('course_id', courseIds);
      if (error) throw error;
      return res.status(200).json({ tasks: (tasks || []).map(stripAnswers) });
    }

    if (action === 'submit') {
      const { taskId, answers } = req.body;
      if (!taskId || !Array.isArray(answers)) throw new HttpError(400, 'taskId and answers[] are required');

      const { data: task, error: taskErr } = await adminClient.from('tasks').select('*').eq('id', taskId).maybeSingle();
      if (taskErr) throw taskErr;
      if (!task || !courseIds.map(String).includes(String(task.course_id))) {
        throw new HttpError(404, 'Quiz not found');
      }
      const targets = parseQuestions(task.target_student_ids);
      if (targets.length > 0 && !targets.map(String).some(t => studentIds.includes(t))) {
        throw new HttpError(403, 'This quiz was not assigned to you');
      }
      const questions = parseQuestions(task.quiz_questions);
      if (questions.length === 0) throw new HttpError(400, 'This task has no quiz questions');

      const { data: prior, error: priorErr } = await adminClient
        .from('student_tasks')
        .select('id')
        .eq('task_id', taskId)
        .in('student_id', studentIds)
        .limit(1);
      if (priorErr) throw priorErr;
      if (prior && prior.length > 0) throw new HttpError(409, 'You have already submitted this quiz');

      const correctAnswers = questions.map(q => q.correct);
      const correctCount = questions.filter((q, i) => Number(answers[i]) === Number(q.correct) && answers[i] !== null && answers[i] !== undefined).length;
      const percent = Math.round((correctCount / questions.length) * 100);
      const maxPoints = Number(task.max_points) || 100;
      const now = new Date().toISOString();

      const { data: saved, error: insErr } = await adminClient.from('student_tasks').insert([{
        id: 'st_' + randomUUID(),
        task_id: taskId,
        student_id: studentIds[0],
        submission_text: `Interactive Quiz completed. Score: ${percent}% (${correctCount}/${questions.length} correct).`,
        grade: Math.round((percent / 100) * maxPoints),
        graded_at: now
      }]).select();
      if (insErr) throw insErr;

      return res.status(200).json({
        submission: saved[0],
        correctCount,
        total: questions.length,
        percent,
        correctAnswers
      });
    }

    throw new HttpError(400, 'Unknown action: ' + action);
  } catch (err) {
    return sendError(res, err);
  }
}
