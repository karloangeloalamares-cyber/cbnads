export default function TermsPage() {
    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-3xl mx-auto px-6 py-12">
                <a
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-8"
                >
                    ← Back to Home
                </a>

                <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
                <p className="text-sm text-gray-500 mb-10">Last updated: March 2026</p>

                <div className="prose prose-gray max-w-none space-y-8 text-sm text-gray-700 leading-relaxed">
                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
                        <p>
                            By submitting an ad request or using any services provided by CBN Ads, you agree to be
                            bound by these Terms of Service. If you do not agree to these terms, please do not use
                            our services.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Ad Submission Policy</h2>
                        <p>
                            By submitting an ad, you confirm that:
                        </p>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>You have the right to advertise the products or services described</li>
                            <li>Your ad content does not violate any applicable laws or regulations</li>
                            <li>Your ad does not contain false, misleading, or deceptive claims</li>
                            <li>Your ad does not infringe on the intellectual property rights of others</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Payment and Cancellations</h2>
                        <p>
                            Ad rates and payment terms will be communicated at the time of booking confirmation.
                            Cancellations must be requested at least 48 hours before the scheduled post date for
                            a full refund. Cancellations made within 48 hours may be subject to a cancellation fee.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Content Approval</h2>
                        <p>
                            All ad submissions are subject to review and approval. CBN Ads reserves the right to
                            reject any ad that does not comply with our content policies or these Terms of Service,
                            at our sole discretion.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Limitation of Liability</h2>
                        <p>
                            CBN Ads shall not be liable for any indirect, incidental, special, or consequential
                            damages arising out of or in connection with the use of our services. Our total liability
                            to you shall not exceed the amount paid for the specific ad placement in question.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Changes to Terms</h2>
                        <p>
                            We reserve the right to update these Terms of Service at any time. Continued use of
                            our services after changes constitutes acceptance of the updated terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Contact</h2>
                        <p>
                            For questions or concerns about these terms, please reach out via our{" "}
                            <a href="/submit-ad" className="text-gray-900 underline">
                                ad submission page
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
