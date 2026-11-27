import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/LegalPage.css';

// Privacy policy and terms. Plain English, describing what the site actually does.
// Review with a legal adviser before relying on these for regulated situations.

const UPDATED = '27 November 2026';
const EMAIL = 'foundaxia@gmail.com';

const Privacy = () => (
  <>
    <h1>Privacy Policy</h1>
    <p className="legal-updated">Last updated: {UPDATED}</p>
    <p>FoundaXia Academy (“FoundaXia”, “we”, “us”) provides live one-to-one online tutoring for families in the United Kingdom, the United States, Canada, Nigeria and elsewhere. This policy explains what personal information we collect, why we collect it, and the choices you have. We have written it to be read by parents, not lawyers.</p>
    <p>If you have any question about your information, email us at <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>

    <h2>1. Children’s information</h2>
    <p>Our students are children and teenagers. We only collect a child’s information when a parent or guardian gives it to us, for example by booking a consultation or enrolling their child. By doing so, the parent or guardian confirms they are entitled to share it and agree to us using it as described here. If you believe a child has given us information without a parent’s agreement, please contact us and we will delete it.</p>

    <h2>2. What we collect</h2>
    <ul>
      <li><strong>When you book a free consultation:</strong> parent’s name, email and phone number, child’s name, your preferred date, time and time zone, any subject you chose, and any note you add.</li>
      <li><strong>When you enrol a child:</strong> the child’s name, the parent’s email and phone number, country, school year or grade, and the programme chosen. Later, with your help, we may add details such as date of birth, school, learning needs and your lesson schedule.</li>
      <li><strong>When you contact us:</strong> your name, email, phone number (if given), topic and message.</li>
      <li><strong>While your child learns with us:</strong> their account login, lessons and materials, timetable, attendance, homework, quiz scores, grades, messages with tutors, and notes their tutor writes about their progress.</li>
      <li><strong>Parent Area and payments:</strong> fees, payment records and receipts. Card payments are handled by our payment provider, Paystack; we never see or store your full card number.</li>
      <li><strong>Notifications:</strong> if you choose to turn on notifications, a technical address for your device so we can send class reminders and messages.</li>
      <li><strong>Website use:</strong> anonymous visit statistics (see section 7).</li>
    </ul>
    <p>Information about a child’s learning needs is sensitive. We only record it when a parent chooses to tell us, and only use it to support the child’s lessons.</p>

    <h2>3. How we use it</h2>
    <ul>
      <li>To arrange your free consultation and recommend a tutor and lesson plan.</li>
      <li>To set up your child’s account, match them with a tutor and run their lessons.</li>
      <li>To show you and your child timetables, progress, scores and tutor notes.</li>
      <li>To take payments and keep financial records.</li>
      <li>To reply to your messages and send important updates about lessons.</li>
      <li>To keep our platform secure and improve it.</li>
    </ul>
    <p>We do not sell your information, and we do not use children’s information for advertising.</p>

    <h2>4. Who can see it</h2>
    <ul>
      <li><strong>Our team and your child’s tutor</strong>, only as needed to teach and support your child.</li>
      <li><strong>Service providers</strong> who run parts of our platform for us: Supabase (secure database and logins), Vercel (website hosting and anonymous statistics), Paystack (payments), and the video service used for live lessons (such as Zoom or Google Meet). They may only use your information to provide their service to us.</li>
      <li><strong>Authorities</strong>, if the law requires it or to protect a child’s safety.</li>
    </ul>

    <h2>5. Where it is stored</h2>
    <p>Our service providers may store and process information in countries other than your own. Where this happens, we rely on providers that use recognised safeguards to protect personal information.</p>

    <h2>6. How long we keep it</h2>
    <p>We keep information while your child is learning with us and for a reasonable period afterwards, for example to answer questions or meet accounting rules. Consultation requests that do not lead to lessons are deleted when they are no longer needed. You can ask us to delete your information sooner (see section 8).</p>

    <h2>7. Cookies and statistics</h2>
    <p>We use anonymous, cookie-free visit statistics to understand how many people visit our website and which pages are useful. These statistics do not identify you. The website also stores a few settings in your browser (for example, to keep you signed in or remember a time zone you picked). We do not use advertising cookies.</p>

    <h2>8. Your rights</h2>
    <p>Depending on where you live (including under the UK GDPR, the EU GDPR, Canada’s PIPEDA and Nigeria’s Data Protection Act), you can ask us to:</p>
    <ul>
      <li>tell you what information we hold about you or your child, and give you a copy;</li>
      <li>correct anything that is wrong;</li>
      <li>delete your or your child’s information;</li>
      <li>stop or limit how we use it.</li>
    </ul>
    <p>Email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> and we will respond within one month. You can also complain to the data protection authority where you live (for example, the Information Commissioner’s Office in the UK).</p>

    <h2>9. Keeping information safe</h2>
    <p>Each student and tutor has their own login, the Parent Area is protected by a separate parent code, and access to information is limited to the people who need it. No system is perfectly secure, but we take reasonable steps to protect your information.</p>

    <h2>10. Changes</h2>
    <p>If we change this policy, we will update the date at the top of this page. For important changes, we will let enrolled families know.</p>
  </>
);

const Terms = () => (
  <>
    <h1>Terms of Service</h1>
    <p className="legal-updated">Last updated: {UPDATED}</p>
    <p>These terms explain how lessons with FoundaXia Academy (“FoundaXia”, “we”, “us”) work. By booking a consultation, enrolling a child or using our platform, you agree to them. If you have a question, email <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>

    <h2>1. The free consultation</h2>
    <p>The first consultation is free and there is no obligation to continue. We use it to understand your child’s needs and to recommend a tutor and a lesson plan.</p>

    <h2>2. Lesson plans and fees</h2>
    <p>After the consultation we send you a tailored plan with the number of lessons and the fee in your local currency. Lessons start once you have accepted the plan and paid as agreed. Fees are paid in advance through our secure online payment provider.</p>

    <h2>3. Scheduling, rescheduling and missed lessons</h2>
    <p>Lessons take place at the times agreed with you, shown in your own local time on your child’s dashboard. If you need to reschedule, please tell us as early as possible and at least 24 hours before the lesson, so we can move it to another time. Lessons missed without notice may not be rescheduled. If we need to cancel a lesson, we will offer another time.</p>

    <h2>4. Changing tutor</h2>
    <p>If your child’s tutor is not the right fit, tell us and we will arrange a different tutor at no extra cost.</p>

    <h2>5. Parents and supervision</h2>
    <p>Lessons are online. Parents and guardians remain responsible for supervising their child at home during lessons and for making sure they have a suitable device and internet connection. We ask students to behave respectfully towards tutors and other learners.</p>

    <h2>6. Accounts</h2>
    <p>Each student receives a personal login and parents receive a private parent code. Please keep these details safe and do not share them. Tell us straight away if you think someone else has used them.</p>

    <h2>7. Learning materials</h2>
    <p>Lesson slides, worksheets, quizzes and other materials are provided for your child’s personal learning. Please do not copy, sell or share them publicly.</p>

    <h2>8. Our responsibility</h2>
    <p>We work hard to help every child make progress, but results depend on many things, including practice and attendance, so we cannot promise specific grades or exam results. We are not responsible for problems caused by things outside our control, such as internet outages. Nothing in these terms affects the rights you have under the consumer laws of your country.</p>

    <h2>9. Your information</h2>
    <p>How we use personal information is explained in our <Link to="/privacy">Privacy Policy</Link>.</p>

    <h2>10. Changes and ending lessons</h2>
    <p>You can stop lessons by telling us. We may update these terms from time to time; we will change the date at the top of this page and tell enrolled families about important changes.</p>
  </>
);

export default function LegalPage({ doc }) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.title = doc === 'terms' ? 'Terms of Service | FoundaXia Academy' : 'Privacy Policy | FoundaXia Academy';
  }, [doc]);
  return (
    <main className="legal-page">
      <article className="legal-card">
        {doc === 'terms' ? <Terms /> : <Privacy />}
        <p className="legal-switch">
          {doc === 'terms' ? <>Also see our <Link to="/privacy">Privacy Policy</Link>.</> : <>Also see our <Link to="/terms">Terms of Service</Link>.</>}
        </p>
      </article>
    </main>
  );
}
