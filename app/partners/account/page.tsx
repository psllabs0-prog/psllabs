import type { Metadata } from "next";
import { PartnerAccount } from "@/components/partners/partner-account";
export const metadata:Metadata={title:"Partner Account | PSL Labs",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function PartnerAccountPage(){return <PartnerAccount/>;}
