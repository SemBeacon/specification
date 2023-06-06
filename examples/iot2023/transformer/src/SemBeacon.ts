import { SerializableMember, SerializableObject } from "@openhps/core";
import { SymbolicSpace } from "@openhps/geospatial";
import { xsd } from "@openhps/rdf";
import { BLEBeaconObject } from "@openhps/rf";

@SerializableObject({
    rdf: {
        type: "http://purl.org/sembeacon/SemBeacon"
    }
})
export class SemBeacon extends BLEBeaconObject {
    @SerializableMember()
    flags: number;

    @SerializableMember()
    namespace: SymbolicSpace<any>;

    @SerializableMember({
        rdf: {
            predicate: "http://purl.org/sembeacon/namespaceId",
            datatype: xsd.hexBinary
        }
    })
    namespaceId: string;

    @SerializableMember({
        rdf: {
            predicate: "http://purl.org/sembeacon/instanceId",
            datatype: xsd.hexBinary
        }
    })
    instanceId: string;

    isValid(): boolean {
        throw new Error("Method not implemented.");
    }
}
