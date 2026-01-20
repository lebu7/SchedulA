import { 
    sendBookingConfirmation, 
    sendAppointmentReminder, 
    sendCancellationNotice 
} from './src/services/smsService.js';

// ---------------------------------------------------------
// 🎭 MOCK DATA (Simulating your Database)
// ---------------------------------------------------------
const mockClient = {
    name: "Lebu Tester",
    phone: "+254719307452" // 👈 Ensure this matchber
};

const mockProvider = {
    name: "Dr. Smith",
    business_name: "Nairobi Health Clinic",
    phone: "+254700000000"
};

const mockService = {
    name: "General Consultation"
};

const mockAppointment = {
    appointment_date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    total_price: 1500,
    amount_paid: 500,
    payment_reference: "QWE12345"
};

// ---------------------------------------------------------
// 🚀 RUN SCENARIOS
// ---------------------------------------------------------
async function runTests() {
    console.log("🚀 STARTING APP SCENARIO TESTS...");
    console.log("---------------------------------------");

    // TEST 1: Booking Confirmation
    console.log("1️⃣  Testing 'Booking Confirmation'...");
    const res1 = await sendBookingConfirmation(mockAppointment, mockClient, mockService, mockProvider);
    if(res1.success) console.log("   ✅ Confirmation Sent!");
    else console.error("   ❌ Failed:", res1.error);

    // TEST 2: Appointment Reminder
    console.log("\n2️⃣  Testing 'Appointment Reminder'...");
    const res2 = await sendAppointmentReminder(mockAppointment, mockClient, mockService, mockProvider);
    if(res2.success) console.log("   ✅ Reminder Sent!");
    else console.error("   ❌ Failed:", res2.error);

    // TEST 3: Cancellation Notice
    console.log("\n3️⃣  Testing 'Cancellation Notice'...");
    const res3 = await sendCancellationNotice(mockAppointment, mockClient, mockService, "Schedule conflict");
    if(res3.success) console.log("   ✅ Cancellation Sent!");
    else console.error("   ❌ Failed:", res3.error);

    console.log("\n---------------------------------------");
    console.log("👀 ACTION: Check the Simulator now!");
}

runTests();