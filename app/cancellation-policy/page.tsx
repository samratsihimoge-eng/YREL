import InfoPage from "@/app/components/InfoPage";
export default function Page(){return <InfoPage eyebrow="Booking changes" title="Cancellation policy" intro="If your plans change, use the booking controls in YREL as early as possible so the partner can be updated." sections={[
{title:"Before a driver is assigned",body:"You can request cancellation from the booking screen while the app is still searching. The booking status will update when the cancellation is processed."},
{title:"After a driver is assigned",body:"Use the cancellation control in your booking and wait for the updated status. Where a cancellation charge applies, it should be displayed in the booking flow or communicated before you confirm the cancellation."},
{title:"Scheduled bookings",body:"For a booking made in advance, cancel as early as possible so the assigned partner can adjust their schedule."},
{title:"Partner unavailable",body:"If YREL cannot find an available partner, the booking will be marked accordingly. You will not be charged for a trip that was not provided through YREL."},
{title:"Disputes or help",body:"If the displayed booking status or any communicated cancellation amount appears incorrect, contact YREL Support from the app and include your booking reference."}
]}/>}
