import { useState } from 'react';

export function useSubmitAdForm() {
    const [formData, setFormData] = useState({
        advertiser_name: '',
        contact_name: '',
        email: '',
        phone_number: '',
        ad_name: '',
        ad_text: '',
        post_type: 'one-time',
        post_date: '',
        post_time: '',
        notes: '',
    });

    const [customDate, setCustomDate] = useState(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setLoading(false);
            setSuccess(true);
        }, 1000);
    };

    return {
        formData,
        customDate,
        setCustomDate,
        error: null,
        success,
        loading,
        availabilityError: null,
        checkingAvailability: false,
        pastTimeError: null,
        fullyBookedDates: [],
        handleChange,
        addCustomDate: () => { },
        removeCustomDate: () => { },
        addMedia: () => { },
        removeMedia: () => { },
        checkAvailability: () => { },
        handleSubmit,
        resetSuccess: () => {
            setSuccess(false);
            setFormData({
                advertiser_name: '',
                contact_name: '',
                email: '',
                phone_number: '',
                ad_name: '',
                ad_text: '',
                post_type: 'one-time',
                post_date: '',
                post_time: '',
                notes: '',
            });
        },
    };
}
