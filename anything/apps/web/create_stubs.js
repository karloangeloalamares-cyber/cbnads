const fs = require('fs');
const path = require('path');

const components = [
  'Sidebar',
  'AdsList',
  'NewAdForm',
  'BillingForm',
  'AdvertisersList',
  'NewAdvertiserForm',
  'ProductsList',
  'SettingsPage',
  'PendingSubmissionsList',
  'InvoicesList',
  'NewInvoiceForm'
];

const dir = path.join(__dirname, 'src', 'components');
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

components.forEach(cmp => {
  const content = `export default function ${cmp}(props) {
  return <div className="p-4 border border-dashed text-gray-400">Placeholder for ${cmp}</div>;
}
`;
  fs.writeFileSync(path.join(dir, `${cmp}.jsx`), content);
});

console.log('Stubs created!');
