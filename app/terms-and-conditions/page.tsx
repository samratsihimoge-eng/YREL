import InfoPage from "@/app/components/InfoPage";
export default function Page(){return <InfoPage eyebrow="Using YREL" title="Terms & conditions" intro="These service terms explain the basic responsibilities involved when you use YREL to request a ride, driver or rental." sections={[
{title:"Bookings",body:"Provide accurate pickup, destination, date, time and service details. A booking request is not an assignment until a YREL partner accepts it and the app shows the assignment."},
{title:"Fare estimates",body:"Displayed estimates are based on the trip details and selected service. Final amounts can vary where the actual route, waiting, package limits or additional usage affect the service. Applicable charges should be shown before confirmation or communicated through the booking."},
{title:"Customer responsibilities",body:"Be ready at the pickup point, provide accurate information, treat partners respectfully and follow applicable road and safety requirements."},
{title:"Partner responsibilities",body:"The assigned partner is responsible for providing the accepted service professionally, keeping required vehicle and licence documents valid and updating trip status accurately."},
{title:"Payments",body:"Customers pay the driver or partner directly after the trip using Cash or UPI. YREL customer bookings do not require a prepaid customer wallet."},
{title:"Account controls",body:"YREL may review accounts and restrict access where there is misuse, safety risk or a breach of these terms. Account deletion requests are subject to Admin review."}
]}/>}
