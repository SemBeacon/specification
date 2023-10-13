import '@openhps/rdf';
import { Absolute2DPosition, Absolute3DPosition, DataObject, LengthUnit, MemoryDataService, ModelBuilder, MultilaterationNode } from '@openhps/core';
import { CSVDataObjectService } from '@openhps/csv';
import { Building, Floor, Room, SymbolicSpace, SymbolicSpaceService } from '@openhps/geospatial';
import { BLEiBeacon, BLEObject, BLEUUID, MACAddress, PropagationModel, RelativeRSSIProcessing } from '@openhps/rf';
import { IriString, ogc, poso, rdf, RDFBuilder, RDFModelSerializer, rdfs, RDFSerializer, schema, Store, xsd } from '@openhps/rdf';
import { SemBeacon } from './SemBeacon';
import axios from 'axios';

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URI = "https://sembeacon.org/examples/";

RDFSerializer.initialize("rf");
RDFSerializer.initialize("geospatial");

function randomMAC(): string {
    return "XX:XX:XX:XX:XX:XX".replace(/X/g, function() {
        return "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16))
    });
}

function shortenURL(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const accessToken = "2cd7bc12126759042bfb3ebe1160aafda0bc65df";
        axios.post("https://api-ssl.bitly.com/v4/shorten", {
            "domain": "bit.ly",
            "long_url": url
        }, {
            headers: {
                "Authorization": `Bearer ${accessToken}`
            }
        }).then(response => {
            resolve(response.data.link);
        }).catch(reject);
    });
}

async function loadData1(experiment: number = 1) {
    const DATASET = "kennedy2019";

    const DATASET_URI = `${BASE_URI}${DATASET}/` as IriString;
    const BEACONS_URI = DATASET_URI + `beacons${experiment}.ttl#` as IriString;
    const namespace = crypto.createHash('md5').update(BEACONS_URI).digest("hex");
    console.log("Loading data for dataset ", DATASET_URI, " with namespace ", namespace);
    const REPLACE_BEACONS = experiment === 1 ? ["1", "13"] : ["50", "54"];

    const data = {
        beacons: ""
    };

    const room = new Room("Office")
        .setBounds([
            new Absolute2DPosition(0, 0, LengthUnit.METER),
            new Absolute2DPosition(0, 25, LengthUnit.METER),
            new Absolute2DPosition(11, 25, LengthUnit.METER),
            new Absolute2DPosition(11, 0, LengthUnit.METER)
        ]);
    const roomRDF = RDFBuilder.fromSerialized(RDFSerializer.serialize(room, {
        baseUri: BEACONS_URI
    }))
        .add(schema.accommodationFloorPlan, RDFBuilder.blankNode()
            .add(rdf.type, schema.FloorPlan)
            .add(schema.layoutImage, `https://github.com/co60ca/BBIL/blob/master/assets/room${experiment === 1 ? "" : "-2"}.png?raw=true`, xsd.anyURI)
            .build())
        .build();
    
    // Room landmarks
    const roomDataStr = fs.readFileSync(
        path.join(__dirname, `../data/${DATASET}/experiment${experiment}/room-data.json`), 
        { encoding: 'utf-8' }
    );
    const roomData = JSON.parse(roomDataStr);
    const landmarks = roomData['Landmarks'].map(landmark => {
        const marker = new DataObject();
        marker.uid = landmark.Label;
        marker.displayName = landmark.Label;
        marker.setPosition(new Absolute2DPosition(
            landmark.XLoc,
            landmark.YLoc,
            LengthUnit.METER
        ));
        return marker;
    });
    const quads = landmarks.map(landmark => {
        const serialized = RDFBuilder.fromSerialized(RDFSerializer.serialize(landmark, {
            baseUri: BEACONS_URI
        }))
            .add(rdf.type, poso.Landmark)
            .add(rdfs.comment, `This is a room landmark with label ${landmark.displayName}`, "en")
            .build();
        return RDFSerializer.serializeToQuads(serialized, BEACONS_URI);
    }).reduce((a, b) => [...a, ...b]);
    quads.push(...RDFSerializer.serializeToQuads(roomRDF, BEACONS_URI));

    // Beacons
    const beaconService = new CSVDataObjectService(BLEObject, {
        file: path.join(__dirname, `../data/${DATASET}/experiment${experiment}/edges.csv`),
        rowCallback: (row: any) => {
            const address = MACAddress.fromString(randomMAC());
            const object = REPLACE_BEACONS.includes(row.edgenodeid) ? new SemBeacon(address) : new BLEObject(address);
            if (object instanceof SemBeacon) {
                // Set sembeacon information
                object.instanceId = crypto.randomBytes(4).readUInt32BE(0).toString(16).padStart(8, "0");
            }
            object.uid = `edge_${row.edgenodeid}`;
            object.displayName = `Edge ${row.edgenodeid}`;
            object.setPosition(
                new Absolute3DPosition(
                    parseFloat(row.edge_x),
                    parseFloat(row.edge_y),
                    parseFloat(row.edge_z)
                ));
            return object;
        }
    });
    await beaconService.emitAsync('build');
    const beacons: BLEObject[] = await beaconService.findAll();
    data.beacons = await RDFSerializer.stringify(
        new Store([...quads, ...await beacons.map(async beacon => {
            let serialized = undefined;
            if (beacon instanceof SemBeacon) {
                serialized = RDFSerializer.serialize(beacon, {
                    baseUri: BEACONS_URI
                });
            } else {
                serialized = RDFBuilder.fromSerialized(RDFSerializer.serialize(beacon, {
                    baseUri: BEACONS_URI
                }))
                    .add(rdf.type, poso.BluetoothReceiver)
                    .build();
            }
            const quads = RDFSerializer.serializeToQuads(serialized, BEACONS_URI);
            return quads;
        }).reduce(async (a, b) => [...await a, ...await b])]),
        { prettyPrint: true, baseUri: BEACONS_URI, format: 'text/turtle' });

    console.log("Saving RDF data ...");
    let dir = path.join(__dirname, "../dist/", DATASET);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, `beacons${experiment}.ttl`), data.beacons);
}

async function loadData2() {
    const DATASET = "openhps2021";
    const DATASET_URI = `${BASE_URI}${DATASET}/` as IriString;
    const BEACONS_URI = DATASET_URI + "beacons.ttl#" as IriString;
    const namespace = crypto.createHash('md5').update(BEACONS_URI).digest("hex");
    console.log("Loading data for dataset ", DATASET_URI, " with namespace ", namespace);
    const REPLACE_BEACONS = [ 'BEACON_07', 'BEACON_08' ];

    const data = {
        beacons: ""
    };

    console.log("Loading geospatial data ...");
    const geojsonStr = fs.readFileSync(
        path.join(__dirname, `../data/${DATASET}/spaces.geo.json`), 
        { encoding: 'utf-8' }
    );
    const geojson = JSON.parse(geojsonStr);
    const spaces = geojson.features.map(feature => SymbolicSpace.fromGeoJSON(feature));
    const building = spaces.filter(space => space instanceof Building)[0];
    const floor = spaces.filter(space => space instanceof Floor)[0];
    const spaceService = new SymbolicSpaceService(new MemoryDataService(SymbolicSpace));
    await spaceService.emitAsync('build');
    await Promise.all(spaces.map(space => spaceService.insertObject(space)));
    const quads = spaces.map(space => {
        if (space.uid === floor.uid) {
            const serialized = RDFBuilder.fromSerialized(RDFSerializer.serialize(space, {
                baseUri: BEACONS_URI
            }))
                .add("http://purl.org/sembeacon/namespaceId", namespace, xsd.hexBinary)
                .build();
            return RDFSerializer.serializeToQuads(serialized);
        } else {
            return RDFSerializer.serializeToQuads(space, BEACONS_URI);
        }
    }).reduce((a, b) => [...a, ...b]);

    console.log("Loading beacon data ...");
    const beaconService = new CSVDataObjectService(BLEObject, {
        file: path.join(__dirname, `../data/${DATASET}/ble_devices.csv`),
        rowCallback: (row: any) => {
            return new Promise(async (resolve) => {
                const address = MACAddress.fromString(randomMAC());
                const object = REPLACE_BEACONS.includes(row.ID) ? new SemBeacon(address) : new BLEiBeacon(address);
                object.uid = row.ID;
                object.displayName = row.ID;
                object.calibratedRSSI = -56;
                object.setPosition(
                    building.transform(
                        floor.transform(new Absolute3DPosition(
                            parseFloat(row.X),
                            parseFloat(row.Y),
                            1.6
                        ))
                    ));
                if (object instanceof SemBeacon) {
                    // Set sembeacon information
                    object.instanceId = crypto.randomBytes(4).readUInt32BE(0).toString(16).padStart(8, "0");
                    object.shortResourceURI = await shortenURL(`${BEACONS_URI}${object.uid}`);
                } else {
                    object.major = crypto.randomBytes(2).readUInt16BE(0);
                    object.minor = crypto.randomBytes(2).readUInt16BE(0);
                    object.proximityUUID = BLEUUID.fromString(namespace);
                }
                resolve(object);
            });
        }
    });
    await beaconService.emitAsync('build');

    const model = await ModelBuilder.create()
        .from()
        .via(new RelativeRSSIProcessing({
            defaultCalibratedRSSI: -56,
            environmentFactor: 2,
            propagationModel: PropagationModel.LOG_DISTANCE
        }))
        .via(new MultilaterationNode({
            minReferences: 2
        }))
        .to()
        .build();
    model.uid = "ips";

    const beacons: BLEObject[] = await beaconService.findAll();
    data.beacons = await RDFSerializer.stringify(
        new Store([
            ...quads, 
            ...await beacons.map(async beacon => {
                const builder = RDFBuilder.fromSerialized(RDFSerializer.serialize(beacon, {
                    baseUri: BEACONS_URI
                }));

                // Add information on where a beacon is placed
                const candidates = await spaceService.findSymbolicSpaces(beacon.getPosition());
                if (candidates.length > 0) {
                    builder.add(ogc.sfWithin, RDFSerializer.serializeToUri(candidates[0][0], BEACONS_URI));
                }
                builder.add("http://purl.org/sembeacon/namespace", RDFSerializer.serializeToUri(floor, BEACONS_URI));
                return RDFSerializer.serializeToQuads(builder.build());
            }).reduce(async (a, b) => [...await a, ...await b]), 
            ...RDFSerializer.serializeToQuads(RDFModelSerializer.serialize(model, {
                baseUri: BEACONS_URI
            }))
        ]),
        { prettyPrint: true, baseUri: BEACONS_URI, format: 'text/turtle', prefixes: {
            sembeacon: 'http://purl.org/sembeacon/'
        } });
    
    console.log("Saving RDF data ...");
    const dir = path.join(__dirname, "../dist/", DATASET);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "beacons.ttl"), data.beacons);
}

setTimeout(() => {
    const dir = path.join(__dirname, "../dist/");
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir);

    loadData1(1);
    loadData1(2);
    loadData2();
}, 100);
