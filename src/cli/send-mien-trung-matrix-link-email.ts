import { getEmailConfigStatus, sendEmail } from '../services/email.service';

const MATRIX_URL = 'https://bnguyendeveloper.github.io/Lottery_Intelligence_Platform/matrix/mien-trung/';

async function main(): Promise<void> {
  const status = getEmailConfigStatus();
  if (!status.configured) throw new Error(`Email is not configured. Missing: ${status.missing.join(', ')}`);
  await sendEmail({
    subject: 'Ma trận tần suất xổ số Miền Trung',
    text: `Mở ma trận tần suất Miền Trung tại: ${MATRIX_URL}`,
    html: `<p>Mở ma trận tần suất xổ số Miền Trung:</p><p><a href="${MATRIX_URL}">${MATRIX_URL}</a></p>`,
  });
  console.log('Mien Trung matrix link email sent successfully.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
