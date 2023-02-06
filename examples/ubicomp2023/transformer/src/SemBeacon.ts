import { SerializableMember, SerializableObject } from "@openhps/core";
import { SymbolicSpace } from "@openhps/geospatial";
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

    @SerializableMember()
    instanceId: number;
}
