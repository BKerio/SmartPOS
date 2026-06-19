import { useState, useRef, useEffect, FormEvent } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { Loader2, Smartphone, EuroIcon } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import API from '@/services/api';

const PayWithMpesa = () => {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ phone?: string; amount?: string }>({});
  const [enrollmentData, setEnrollmentData] = useState<{ totalFee: number; paidAmount: number; balance: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL;
  const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || '').toString();
  const socketRef = useRef<Socket | null>(null);
  const pendingTimerRef = useRef<number | null>(null);
  const hardTimeoutRef = useRef<number | null>(null);
  const [showBubbles, setShowBubbles] = useState(false);
  const MySwal = withReactContent(Swal);

  const regNo = typeof window !== 'undefined' ? (localStorage.getItem('regNo') || '') : '';

  // Fetch latest enrollment data (fee and balance)
  const fetchLatestEnrollment = async (showLoading = false) => {
    try {
      if (showLoading) setRefreshing(true);
      const token = localStorage.getItem('token');
      const { data } = await API.get('/enrollments/me/latest', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data) {
        const totalFee = Number(data.totalFee || 0);
        const paidAmount = Number(data.paidAmount || 0);
        const balance = totalFee - paidAmount;
        
        const enrollmentInfo = { totalFee, paidAmount, balance };
        setEnrollmentData(enrollmentInfo);
        
        // Set amount to the remaining balance if there is one
        if (balance > 0) {
          setAmount(String(balance));
        } else if (totalFee > 0 && paidAmount === 0) {
          setAmount(String(totalFee));
        }
        
        return enrollmentInfo;
      }
    } catch (e) {
      console.error('Failed to fetch enrollment:', e);
    } finally {
      if (showLoading) setRefreshing(false);
    }
    return null;
  };

  // Prefill amount from latest enrollment on mount
  useEffect(() => {
    fetchLatestEnrollment(false);
  }, []);

  const validateInputs = (): boolean => {
    const errors: { phone?: string; amount?: string } = {};

    if (!/^(01|07)\d{8}$/.test(phone)) {
      errors.phone = 'Enter valid 10-digit phone number (e.g. 0712345678)';
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      errors.amount = 'Enter a valid amount greater than 0';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const connectSocket = () => {
    if (socketRef.current && socketRef.current.connected) return socketRef.current;
    // Derive socket URL: prefer VITE_SOCKET_URL, else strip trailing /api from API_URL
    const derivedUrl = SOCKET_URL || (API_URL ? API_URL.replace(/\/?api\/?$/, '') : '');
    socketRef.current = io(derivedUrl, { transports: ['websocket'] });
    return socketRef.current;
  };

  const clearTimers = () => {
    if (pendingTimerRef.current) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    if (hardTimeoutRef.current) {
      window.clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimers();
      setShowBubbles(false);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationErrors({});
    if (!validateInputs()) return;

    setShowBubbles(false);
    setLoading(true);

    try {
      const formattedPhone = '254' + phone.slice(-9);
      const numericAmount = Number(amount);

      MySwal.fire({
        title: 'Processing Payment...',
        text: 'Please wait while we initiate the STK push.',
        icon: 'info',
        allowOutsideClick: false,
        didOpen: () => {
          const modalContent = document.querySelector('.swal2-html-container');
          if (modalContent) {
            const bubblesContainer = document.createElement('div');
            bubblesContainer.className = 'flex items-center justify-center mt-4';
            bubblesContainer.innerHTML = `
              <div class="flex items-end space-x-3">
                <span class="w-5 h-5 rounded-full bg-green-500 animate-bounce" style="animation-delay: 0ms"></span>
                <span class="w-5 h-5 rounded-full bg-blue-500 animate-bounce" style="animation-delay: 100ms"></span>
                <span class="w-5 h-5 rounded-full bg-yellow-500 animate-bounce" style="animation-delay: 200ms"></span>
                <span class="w-5 h-5 rounded-full bg-red-500 animate-bounce" style="animation-delay: 300ms"></span>
                <span class="w-5 h-5 rounded-full bg-purple-500 animate-bounce" style="animation-delay: 400ms"></span>
              </div>
            `;
            modalContent.appendChild(bubblesContainer);
          }
        }
      });

      const payload: any = {
        phone: formattedPhone,
        amount: numericAmount,
      };
      if (regNo) payload.accountReference = regNo; // tie payment to admission number

      const response = await axios.post(`${API_URL}/stkpush`, payload);

      const { CheckoutRequestID } = response.data || {};

      if (CheckoutRequestID) {
        const socket = connectSocket();
        socket.off('transaction_update');
        socket.emit('join_checkout', { checkoutRequestId: CheckoutRequestID });

        pendingTimerRef.current = window.setTimeout(() => {
          MySwal.fire({ title: 'Still Pending…', text: 'If you have not received the prompt, ensure your SIM is active and try again.', icon: 'info', confirmButtonText: 'OK' });
        }, 45000);

        hardTimeoutRef.current = window.setTimeout(() => {
          setShowBubbles(false);
          MySwal.fire({ title: 'Payment Timeout', text: 'We did not receive a response in time. Please try again.', icon: 'warning', confirmButtonText: 'OK' });
        }, 180000);

        socket.on('transaction_update', async (payload: any) => {
          clearTimers();
          setShowBubbles(false);
          const status: string = payload?.status || 'failure';
          const desc: string = payload?.resultDesc || 'Payment update received.';

          Swal.close();

          if (status === 'success') {
            // Fetch updated enrollment data after successful payment
            const enrollment = await fetchLatestEnrollment();
            
            let successMessage = `KES ${payload?.amount || numericAmount} received. Receipt: ${payload?.receipt || 'N/A'}`;
            if (enrollment) {
              const balance = enrollment.balance;
              if (balance > 0) {
                successMessage += `\n\nRemaining balance: KES ${balance.toLocaleString()}`;
              } else {
                successMessage += `\n\n✅ Your fees are now fully paid!`;
              }
            }
            
            MySwal.fire({ 
              title: 'Payment Successful', 
              text: successMessage, 
              icon: 'success', 
              confirmButtonText: 'Great' 
            });
          } else if (status === 'cancelled') {
            MySwal.fire({ title: 'Payment Cancelled', text: 'You cancelled the payment prompt.', icon: 'error', confirmButtonText: 'OK' });
          } else if (status === 'wrong_pin') {
            MySwal.fire({ title: 'Wrong PIN', text: 'The PIN entered was incorrect. Please try again.', icon: 'error', confirmButtonText: 'Retry' });
          } else if (status === 'insufficient_funds') {
            MySwal.fire({ title: 'Insufficient Funds', text: 'Your M-Pesa balance is insufficient for this transaction.', icon: 'error', confirmButtonText: 'OK' });
          } else if (status === 'timeout') {
            MySwal.fire({ title: 'Request Timed Out', text: 'The payment request timed out. Please try again.', icon: 'warning', confirmButtonText: 'OK' });
          } else {
            MySwal.fire({ title: 'Payment Failed', text: desc, icon: 'error', confirmButtonText: 'OK' });
          }
        });
      }

      setShowBubbles(true);
    } catch (err: any) {
      console.error('STK Push Error:', err);
      const backendError = err?.response?.data;
      const details = typeof backendError?.details === 'string'
        ? backendError?.details
        : backendError?.details
          ? JSON.stringify(backendError?.details)
          : err?.message;
      const errorMessage = backendError?.error || 'Payment initiation failed.';

      MySwal.fire({ title: 'Payment Failed', html: `${errorMessage}${details ? `<br/><small>${details}</small>` : ''}`, icon: 'error', confirmButtonText: 'Try Again' });
      setShowBubbles(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans bg-white">
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-gray-800 tracking-tight">Pay with M-Pesa</h1>
          <p className="mt-2 text-slate-500 text-sm">Your phone will receive a prompt to authorize payment</p>
          
          {/* Balance Display */}
          {enrollmentData && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex justify-between items-center text-sm mb-1">
                <span className="text-gray-600">Total Fee:</span>
                <span className="font-semibold text-gray-800">KES {enrollmentData.totalFee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm mb-1">
                <span className="text-gray-600">Amount Paid:</span>
                <span className="font-semibold text-green-600">KES {enrollmentData.paidAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-2 border-t border-blue-200">
                <span className="text-gray-700 font-medium">Remaining Balance:</span>
                <span className={`font-bold text-lg ${enrollmentData.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  KES {enrollmentData.balance.toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => fetchLatestEnrollment(true)}
                disabled={refreshing}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
              >
                {refreshing ? 'Refreshing...' : '🔄 Refresh Balance'}
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Admission Number (Account)</label>
            <input value={regNo} readOnly className="w-full py-2.5 px-3 rounded-md bg-gray-100 border border-gray-300 text-gray-600 cursor-not-allowed" />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
              M-Pesa Phone Number
            </label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-black" />
              <input
                id="phone"
                type="tel"
                placeholder="0712345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-full pl-12 pr-4 py-2.5 rounded-md border shadow-sm transition focus:ring-2 ${
                  validationErrors.phone ? 'border-red-400 focus:ring-red-300' : 'border-slate-300 focus:ring-green-400'
                }`}
                disabled={loading}
              />
            </div>
            {validationErrors.phone && <p className="mt-1 text-xs text-red-500">{validationErrors.phone}</p>}
          </div>

          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-slate-700 mb-1">
              Amount (KES)
            </label>
            <div className="relative">
              <EuroIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="amount"
                type="number"
                placeholder="e.g. 100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full pl-12 pr-4 py-2.5 rounded-md border shadow-sm transition focus:ring-2 ${
                  validationErrors.amount ? 'border-red-400 focus:ring-red-300' : 'border-slate-300 focus:ring-green-400'
                }`}
                disabled={loading}
              />
            </div>
            {validationErrors.amount && <p className="mt-1 text-xs text-red-500">{validationErrors.amount}</p>}
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center py-2.5 px-4 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md transition-all duration-300 focus:ring-4 focus:ring-green-200 disabled:bg-green-300 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `Pay KES ${Number(amount) || 0}`
              )}
            </button>
          </div>
        </form>

        {showBubbles && (
          <div className="mt-6 flex items-center justify-center">
            <div className="flex items-end space-x-3" aria-label="Payment prompt sent, awaiting your confirmation">
              <span className="w-4 h-4 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-4 h-4 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '100ms' }} />
              <span className="w-4 h-4 rounded-full bg-yellow-500 animate-bounce" style={{ animationDelay: '200ms' }} />
              <span className="w-4 h-4 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="w-4 h-4 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '400ms' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayWithMpesa;
