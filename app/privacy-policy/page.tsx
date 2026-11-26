import InfoPage from "@/app/components/InfoPage";
export default function Page(){return <InfoPage eyebrow="Your information" title="Privacy at YREL" intro="We use the information needed to operate bookings, support customers and coordinate trips with YREL partners." sections={[
{title:"Information you provide",body:"This can include your name, mobile number, account details, saved locations, booking information and messages sent to support."},
{title:"Location during a trip",body:"Location information may be used to find pickup points, calculate routes and support live trip coordination when you use location-enabled features."},
{title:"How information is used",body:"Information is used to create and manage accounts, process bookings, connect customers with partners, provide support, maintain safety and improve the service."},
{title:"Sharing for trip fulfilment",body:"Relevant booking and contact details are shared with the assigned YREL partner so the requested service can be completed. Information may also be processed by service providers supporting hosting, authentication and database operations."},
{title:"Your choices",body:"Keep your profile details current and use the account controls available in the app. Account deletion requests are reviewed by YREL Admin; an account remains active while a request is pending."},
{title:"Security and retention",body:"YREL uses access controls and technical safeguards appropriate to the service. Records may be retained where needed for bookings, dispute handling, security or legal obligations."}
]}/>}
