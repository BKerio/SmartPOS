import { isMailConfigured, sendParentWelcomeEmail } from '@/services/mail';
import { isAdvantaSmsConfigured, sendAdvantaSms } from '@/services/sms';

export async function sendParentWelcomeNotifications(params: {
  parent: { name: string; email: string; phone?: string | null; receiveSms?: boolean; receiveEmail?: boolean };
  password: string;
  students: Array<{ name: string; regNo: string }>;
}) {
  const { parent, password, students } = params;

  const jobs: Array<Promise<any>> = [];

  if (parent.receiveEmail !== false && parent.email && isMailConfigured()) {
    jobs.push(
      sendParentWelcomeEmail({
        to: parent.email,
        parentName: parent.name,
        password,
        students,
      }),
    );
  }

  if (parent.receiveSms !== false && parent.phone && isAdvantaSmsConfigured()) {
    const lines = [
      `Welcome ${parent.name}. Your SmartPOS Parent account is ready.`,
      `Password: ${password}`,
    ];
    if (students.length) {
      const s = students.map((st) => `${st.name} (${st.regNo})`).join(', ');
      lines.push(`Student(s): ${s}`);
    }
    jobs.push(sendAdvantaSms(parent.phone, lines.join('\n')));
  }

  const results = await Promise.allSettled(jobs);
  const errors = results
    .filter((r) => r.status === 'rejected')
    .map((r: any) => r.reason?.message || String(r.reason || 'Unknown error'));

  if (errors.length) {
    throw new Error(`Welcome notification failed: ${errors.join(' | ')}`);
  }
}

