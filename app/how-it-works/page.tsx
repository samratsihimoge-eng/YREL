import InfoPage from "@/app/components/InfoPage";
export default function Page(){return <InfoPage eyebrow="Your journey, simplified" title="How YREL works" intro="A clear, comfortable booking journey from choosing your service to reaching your destination." sections={[
{title:"Choose your service",body:"Start with the service that matches your journey.",bullets:["Book a Cab for point-to-point travel","Book a Driver when you need a professional chauffeur","Choose Cab Rentals for hourly or outstation plans"]},
{title:"Add your trip details",body:"Set your pickup and destination, choose the date and time, and review the trip details before confirming."},
{title:"Meet your driver",body:"YREL searches for an available partner. When a driver accepts, review the driver and vehicle details and use the in-app trip options."},
{title:"Complete your journey",body:"After the trip, settle the amount directly with your driver or partner using Cash or UPI. Your booking record keeps the trip and payment status."},
{title:"City rental packages",body:"Fixed city packages include the listed hours and kilometres.",bullets:["Hatchback: ₹399 / ₹699 / ₹899","Sedan: ₹449 / ₹799 / ₹999","MPV: ₹599 / ₹999 / ₹1,299","SUV: ₹699 / ₹1,199 / ₹1,499"],},
{title:"Outstation billing",body:"Outstation rentals use a minimum billable distance of 300 km per day, including round trips. Two days are billed at a 600 km minimum; three days at 900 km."}
]}/>}
