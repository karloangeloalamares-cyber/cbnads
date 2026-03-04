export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-3xl mx-auto px-6 py-12">
                <a
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-8"
                >
                    ← Back to Home
                </a>

                <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
                <p className="text-sm text-gray-500 mb-10">Last updated: March 2026</p>

                <div className="prose prose-gray max-w-none space-y-8 text-sm text-gray-700 leading-relaxed">
                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Information We Collect</h2>
                        <p>
                            When you submit an ad request through CBN Ads, we collect the information you provide,
                            including your name, business name, email address, phone number, and ad content. We use
                            this information solely to process your ad request and communicate with you about your campaign.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">2. How We Use Your Information</h2>
                        <p>We use the information we collect to:</p>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>Process and schedule your advertising campaigns</li>
                            <li>Send you confirmations, updates, and reminders about your ads</li>
                            <li>Respond to your inquiries and support requests</li>
                            <li>Improve our services and platform</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Information Sharing</h2>
                        <p>
                            We do not sell, trade, or otherwise transfer your personally identifiable information to
                            third parties. We may share information with trusted service providers who assist us in
                            operating our platform, subject to confidentiality agreements.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Data Retention</h2>
                        <p>
                            We retain your personal information for as long as necessary to fulfil the purposes
                            described in this policy, or as required by law. You may request deletion of your data
                            at any time by contacting us.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Security</h2>
                        <p>
                            We implement reasonable technical and organizational measures to protect your personal
                            information against unauthorized access, alteration, disclosure, or destruction.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Your Rights</h2>
                        <p>
                            Depending on your jurisdiction, you may have the right to access, correct, delete, or
                            restrict processing of your personal information. To exercise these rights, contact us
                            using the information below.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Contact Us</h2>
                        <p>
                            If you have questions about this Privacy Policy, please contact us at{" "}
                            <a href="/submit-ad" className="text-gray-900 underline">
                                cbnads.com/submit-ad
                            </a>
                            .
                        </p>
                    </section>
                </div>

                <div className="mt-12 pt-6 border-t border-gray-200 text-center">
                    <a href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                        ← Back to Home
                    </a>
                </div>
            </div>
        </div>
    );
}
